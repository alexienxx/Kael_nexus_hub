# 📝 KAEL COMPANION — Changelog

> Registro cronologico di tutte le modifiche al progetto.
> Aggiornato ad ogni intervento.

---

## [Unreleased] — 2026-03-21

### 🆕 Added
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
