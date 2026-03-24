# 📝 KAEL COMPANION — Changelog

> Registro cronologico di tutte le modifiche al progetto.
> Aggiornato ad ogni intervento.

---

## [Unreleased] — 2026-03-23b

### 🏗️ Build System — Dual-mode Capacitor (Lovable + Prod)
- **`capacitor.config.ts` — default = Lovable live-preview**: `server.url` punta al preview Lovable (`0a6f887f-...lovableproject.com`). L'APK sul telefono carica la UI da remoto; modifiche su Lovable appaiono istantaneamente senza rebuild.
- **`capacitor.config.prod.ts` — NEW**: Config produzione senza `server.url`. UI caricata da `dist/` locale dentro l'APK. Usata solo dallo script di build in mode prod.
- **`build_apk.ps1` — NEW**: Script unico per build APK con due modalita':
  - `.\build_apk.ps1` (default) — build con config Lovable, install su device
  - `.\build_apk.ps1 -Mode prod` — swap temporaneo a config prod, npm build, Gradle, sign, install, ripristino config Lovable
  - `.\build_apk.ps1 -AdbWifi -PhoneIp <ip>` — setup ADB WiFi (niente cavo)
  - Gestisce automaticamente: `local.properties`, JDK 21, zipalign, apksigner (debug keystore)

### 🔔 Native Notifications — Autonomous Messages
- **`src/lib/nativeNotifications.ts` — NEW**: Helper notifiche native Android via `@capacitor/local-notifications`. Canale `kael_autonomous` (importanza HIGH = heads-up). Richiesta permessi al boot, tap su notifica dispatcha evento DOM `kael-notification-tap`.
- **`src/components/layout/AppShell.tsx` — MODIFIED**: SSE bridge con logica 3 livelli:
  - App in background (`document.hidden`) → notifica nativa Android
  - App visibile ma non su chat → toast in-app (sonner)
  - Su chat page → nulla (Chat.tsx gestisce direttamente)
- **`src/App.tsx` — MODIFIED**: `initNativeNotifications()` chiamata al boot dell'app.
- **`android/app/src/main/AndroidManifest.xml` — MODIFIED**: Aggiunti permessi `POST_NOTIFICATIONS` e `SCHEDULE_EXACT_ALARM`.
- **`@capacitor/local-notifications@8.0.2`** aggiunto alle dipendenze.

### 📝 Impact
- **Sviluppo**: Zero azioni manuali. L'APK punta a Lovable di default, aggiornamenti automatici.
- **Build prod**: Un solo comando (`.\build_apk.ps1 -Mode prod`) per APK con UI locale.
- **Notifiche**: Messaggi autonomi di Kael generano notifiche native Android quando l'app e' in background.

---

## [Unreleased] — 2026-03-25

### 🔧 Fixed — Critical Chat Routing
- **`src/pages/Chat.tsx` — Kael restored as canonical route**: `handleSend()` now always calls `chatApi.sendMessage()` for the main conversation. Agent mode no longer replaces Kael.
- **`src/pages/Chat.tsx` — external agent made additive/non-blocking**: when Agent mode is ON, `sendExternalAgentMessage()` runs only as an optional secondary path after Kael responds. Missing API key or proxy/provider failure no longer blocks the main chat.
- **`src/components/layout/BottomNav.tsx` — removed destructive persistence of agent mode**: the Agent toggle is now session-only UI state and no longer persists via `localStorage("kael_agent_mode")`, preventing accidental future hijack of the primary chat route.

### ✅ Verification Contract
- **agentMode ON**: Kael still responds.
- **agentMode OFF**: Kael still responds.
- **No external API key**: Kael still works; only the optional external path fails.

### ✨ Added / Changed
- **Agente Esterno integrato nella chat principale**: Il pulsante "Agent" nella barra in basso ora funziona come toggle ON/OFF. Quando attivo (icona teal + pallino pulsante), i messaggi vengono inviati all'agente esterno selezionato invece che a Kael. Le risposte appaiono nella stessa conversazione con bubble di colore diverso e etichetta modello.
- **Modelli OpenAI aggiornati**: Rimossi modelli obsoleti (GPT-4 Turbo, o1), aggiunti GPT-5, 5.2, 5.3, 5.4, o3 Pro, o3 Mini.
- **Menu agenti scrollabile**: La lista modelli nelle impostazioni è ora scrollabile per gestire il numero crescente di modelli.
- **Rimossa pagina ExternalAgentChat separata**: La funzionalità è ora integrata nella chat principale.
- **System Prompt personalizzabile**: Icona rotellina (⚙️) in alto a destra nel menu agenti apre un editor per il system prompt. Viene inviato come messaggio `system` a ogni conversazione con l'agente. Persistenza in `localStorage("kael_external_agent_system_prompt")`.

---


### 🔧 Fixed / Wired
- **`PhotoGalleryUpload.tsx` — sostituita con implementazione reale**: L'implementazione di Lovable era localStorage-only, generica, senza identità. Sostituita con picker reale connesso al backend:
  - Tab segmentato "Foto di Alexièn" / "Foto di Kael" — identity selection prima del pick
  - Upload via `POST /multimodal/photos/upload` (multipart) → `save_photo()` in `photo_container.py`
  - Lista foto da `GET /multimodal/photos/list?identity=...` al cambio tab
  - Thumbnail da `GET /multimodal/photos/file/{identity}/{name}` (FileResponse backend)
  - Delete via `DELETE /multimodal/photos/file/{identity}/{name}`
  - Loading skeletons, error banner, refresh button
  - Commento legale obbligatorio: authorized use only, solo Alexièn e Kael

- **`lib/api/referencePhotos.ts` — nuovo modulo API**: Funzioni `listReferencePhotos()`, `uploadReferencePhoto()`, `deleteReferencePhoto()`, `referencePhotoUrl()` con tipo `AuthorizedIdentity = "kael" | "alexien"`. Usa `apiRequest` e `apiUpload` da `client.ts`.

### 📝 Impact
- **PhotoGalleryUpload.tsx**: Nessun più dato in localStorage. Tutte le foto vanno su `state/vision/photo_container/{identity}/` sul server. Constraint identità applicato lato backend (`_ALLOWED_IDENTITIES = {"kael", "alexien"}`).
- **Backend**: Richiede il backend attivo su `/multimodal/*` (router ora montato in `kael_refactor/runtime/router.py`).

---

## [Unreleased] — 2026-03-23

### 🆕 Added
- **`sendCallVoiceMessage()` in `lib/api/voice.ts`**: Nuova funzione che invia un chunk audio base64 a `POST /mobile/call/voice` e restituisce `VoiceCallTurnResponse` (`reply`, `reply_audio_base64`, `transcription`, `emotion`, `call_id`). Completa il contratto API per le chiamate audio.

- **Audio loop durante videochiamata (`Calls.tsx`)**: Implementato il ciclo di cattura e risposta audio durante le chiamate attive:
  - `startAudioLoop(stream, callId)`: avvia `MediaRecorder` con `start(4000)` — ogni 4 s invia chunk audio al backend via `sendCallVoiceMessage()`
  - `stopAudioLoop()`: ferma il registratore in modo sicuro
  - Il chip di trascrizione UI si popola ora con le trascrizioni utente e le risposte Kael in tempo reale
  - L'audio di risposta (`reply_audio_base64`) viene riprodotto immediatamente via `new Audio(...).play()`
  - Guards: `isMutedRef` (chunk scartato se muted), `isProcessingRef` (no concurrent sends), `callActiveRef` (stop se chiamata terminata)
  - Cleanup su `handleEndCall` e su unmount

- **Source of truth — SEZIONE 6-8** (`source_of_truth-apk_kael_nexus_hub.py`):
  - Sezione 6: videocall audio loop (call/voice wiring completo)
  - Sezione 7: external agent Supabase proxy (cablaggio confermato corretto)
  - Sezione 8: wallpaper kaelMode stubs (stato documentato, fix `syncStatus` applicato)

### 🔧 Fixed
- **`useChatWallpaper.ts` — `syncStatus` stubs**: I modi `share_once` e `persistent_context` settavano `syncStatus: "pending_upload"` che non veniva mai risolto (nessun endpoint backend esiste). Ora tutti i modi usano `syncStatus: "local_only"`, che riflette onestamente lo stato reale. Il campo `syncStatus` rimane nel type per uso futuro.

### 📝 Impact
- **Calls.tsx**: La pagina videochiamata è ora completamente funzionale end-to-end. La trascrizione che prima era dichiarata ma mai popolata ora si aggiorna in tempo reale.
- **voice.ts**: Contratto API call/voice aggiunto. Nessuna breaking change.
- **useChatWallpaper.ts**: Nessuna breaking change di comportamento. I dati localStorage esistenti con `pending_upload` vengono letti correttamente (campo opzional non bloccante).

---

## [Unreleased] — 2026-03-21

### 🆕 Added
- **Settings → Foto Kael & Alexièn**: Galleria dedicata per caricare foto di riferimento
  - Upload multiplo con anteprima griglia
  - Le foto servono come reference per il backend di generazione immagini (img2img, LoRA, IP-Adapter)
  - Commenti dettagliati nel codice per guidare l'implementazione backend
  - Endpoint suggeriti: `/media/reference-gallery` (CRUD) e `/media/generate-together`
  - Persistenza locale in localStorage, pronte per migrazione a storage bucket

### 🔄 Changed
- **Bottom Nav**: Rimosso link "Memories" (placeholder) dalla barra di navigazione

### 🆕 Previously Added
- **Chat con Agente Esterno**: Nuova pagina `/external-agent` per chattare con AI esterne (GPT, Claude, Gemini)
  - Bolle colorate per provider: verde acqua (OpenAI), arancione (Anthropic), blu (Google)
  - Label modello in alto nella bolla (es. "OpenAI · GPT-4o") in testo bianco piccolo
  - Bordo colorato per le bolle dell'agente
  - Cronologia conversazione completa inviata ad ogni messaggio
- **Settings → Agente Esterno**: Sezione dedicata per API key e selezione modello
  - 13 modelli supportati tra OpenAI, Anthropic e Google
  - Selezione visuale raggruppata per provider
  - Persistenza in localStorage
- **Bottom Nav → "Agent"**: Icona 🤖 (Bot) nella barra di navigazione per accesso rapido
- **Edge Function `external-agent-proxy`**: Proxy server-side per OpenAI, Anthropic e Google APIs

- **Long-press su bubble utente → "Modifica messaggio"**: Il messaggio viene rimosso e il testo viene ripopolato nell'input per la correzione e il re-invio
- **Long-press su immagini di Kael → "Scarica immagine"**: Download diretto dell'immagine dal menu contestuale
- **Long-press su audio di Kael → "Scarica audio"**: Download diretto dell'audio dal menu contestuale
- **Pulsante download nei vocali**: Icona ⬇️ aggiunta direttamente nel banner audio di ogni messaggio vocale
- **Componente `BubbleContextMenu`**: Menu contestuale nativo per long-press sui bubble con azioni contestuali

- **Freccia indietro nelle pagine secondarie**: Tutte le pagine (Media, Workspace, Memories, Settings) ora hanno un pulsante ← nell'header per tornare alla Chat
  - Prop `showBack` aggiunta a `KaelHeader`
  - Navigazione via `useNavigate("/")`

- **Supporto Landscape Mode**: L'app funziona correttamente in orientamento orizzontale senza interruzioni
  - Safe areas laterali (`safe-left`, `safe-right`) per notch/punch-hole in landscape
  - Header e bottom nav compatti in landscape con altezza ridotta (`max-height: 500px`)
  - Viewport meta con `maximum-scale=1.0` per evitare zoom accidentali durante la rotazione
  - La rotazione del telefono NON interrompe invio/ricezione messaggi (stato React preservato)
  - Nessun remount dei componenti durante il cambio orientamento
- **Icona Spotify nella bottom nav**: Bottone dedicato che apre l'app Spotify sul dispositivo via deep link (`spotify://`), con fallback al browser web
  - Su Android/Capacitor: tenta deep link nativo, fallback dopo 1.5s
  - Su web: apre `open.spotify.com` in nuova tab

- **Condivisione musicale in chat**: Kael può inviare brani e playlist come card ricche nei messaggi
  - `TrackCard` rinnovato: icona Spotify SVG, deep link nativo, messaggio personale opzionale
  - Nuovo `PlaylistCard`: card dedicata per playlist con cover art, conteggio brani, badge "Creata da Kael"
  - Entrambi i componenti supportano deep link Spotify nativo su Android

- **API Spotify estesa per Kael**:
  - `POST /spotify/playlist/create` — Kael crea playlist sull'account Spotify dell'utente
  - `GET /spotify/suggestions` — Suggerimenti musicali di Kael (brani + playlist)
  - Tipi: `KaelPlaylistRequest`, `KaelPlaylistResponse`, `KaelMusicSuggestion`

- **Tipo `PlaylistCard`** aggiunto a `types/index.ts` e `ChatMessage.playlistCard`
- **Componente `SpotifyIcon`** — icona SVG Spotify riutilizzabile


  - Anteprima con controlli visivi (fit, posizione, blur, overlay, dimness)
  - 3 modalità Kael: solo sfondo / condividi una volta / contesto visivo persistente
  - Impostazioni display dedicate (stile bolle: solido/vetro/gradiente/tinta)
  - Persistenza per-conversazione in localStorage
  - Architettura preparata per integrazione backend vision
  - Files: `types/wallpaper.ts`, `hooks/useChatWallpaper.ts`, `hooks/useLongPress.ts`, `components/wallpaper/*`

- **Long-press sull'avatar di Kael** nel header: apre la galleria per cambiare foto di Kael (rimossa necessità di andare in Settings)

- **Mini-menu media nel chat input**: l'icona foto ora apre un popup con:
  - "Foto dalla galleria" (senza capture, apre galleria)
  - "Scatta foto" (con capture=environment, apre fotocamera)

- **Netharion a 3 livelli**: indicatore ora supporta 3 stati
  - 🟢 `idle` — sistema ok (verde)
  - 🟠 `warning` — attenzione (arancione)
  - 🔴 `alert` — allarme (rosso)

- **Manuale tecnico** (`KAEL_MANUAL.md`): documentazione completa di ogni componente, toggle, endpoint e struttura dati per agenti backend
- **Changelog** (`CHANGELOG.md`): registro cronologico modifiche

- **Hook `useBootUpdateCheck`**: stub per controllo update all'avvio (da collegare al backend)

### ✏️ Changed
- **Dialog aggiornamento APK rinnovato**: bottoni rinominati "Installa ora" / "Installa dopo" / "Chiudi"; rimossa dicitura "Scarica e installa"; pulsante chiudi ora funziona correttamente in tutti gli stati


- **Bottom nav ristrutturata**:
  - Rimossa voce "Calls" (già presente nel header della chat)
  - Icona "Media" → "Allegati" con icona 📎 Paperclip
  - 5 voci: Chat, Allegati, Workspace, Memories, Settings

- **Rimosso bottone "+" dal header chat**: il services sheet non è più accessibile dalla chat (era ridondante)

- **ChatInput**: rimosso `capture="environment"` dal file input principale (prima apriva solo la fotocamera invece della galleria)

### 🐛 Fixed
- **Build errors risolti**:
  - `useBootUpdateCheck` modulo mancante → creato stub
  - `generateUUID` non definito in `useSession.ts` → sostituito con `crypto.randomUUID()`
  - `Promise.any` non supportato → sostituito con `Promise.allSettled` in `sentinel.ts`
  - `invalidateBackendCache` non esportato da `client.ts` → aggiunta funzione
  - `backend_turn_id` type mismatch (number vs string) in `Chat.tsx` → conversione con `String()`
  - Test `external-agent.test.ts` con campi `ChatResponse` errati → corretti a `reply`/`session_id`

---

## [1.0.8] — Build 108 (precedente)

### 🆕 Added
- Multi-agent support: sender type `external_agent` con avatar e nome personalizzati
- External agent test suite
- Backend lifecycle system con auto-discovery (USB → LAN → Tailscale)
- Sentinel integration per wake-on-demand del backend
- Capability system (`useCapability` hook)
- WiFi update system (manifest check + APK download in-app)
- Spotify integration (OAuth, Now Playing, Library)
- GitHub repo-awareness (agentic actions)
- Services Hub con context chips nella chat
- Theme customization completa con presets
- Voice calls page con WebSocket transcription
- Memories page
- Media gallery page
- RLHF feedback (like/dislike) sui messaggi
- TTS playback delle risposte di Kael
- Chat history loading dal backend
- Image analysis via backend vision
- Voice note recording e invio
- Netharion indicator (inizialmente 2 livelli: verde/rosso)
- Glassmorphism design system con neon accents
- Capacitor setup per Android APK

---

## Convenzioni Changelog

- 🆕 **Added**: Nuove funzionalità
- ✏️ **Changed**: Modifiche a funzionalità esistenti
- 🐛 **Fixed**: Bug fix
- 🗑️ **Removed**: Funzionalità rimosse
- ⚠️ **Deprecated**: Funzionalità da rimuovere in futuro
- 🔒 **Security**: Fix di sicurezza
