# 📝 KAEL COMPANION — Changelog

> Registro cronologico di tutte le modifiche al progetto.
> Aggiornato ad ogni intervento.

---
## [1.0.15 — Autoriconnessione backend durevole] — 2026-09-05

- Eliminata la dipendenza dal pulsante manuale `Reconnect`: dopo un backend
  irraggiungibile o una rete assente, il client continua a tentare in autonomia.
- I retry degradati usano una sola catena single-flight con backoff esponenziale,
  jitter e tetto a 30 secondi; successo, retry esplicito e unmount cancellano i timer.
- Gli eventi ravvicinati di rete condividono un solo warmup e non possono generare
  ventagli di probe concorrenti.
- Il ritorno allo stato `online` riattiva il percorso gia esistente di catch-up
  autorevole: pagine `/chat/history/pending`, cursore canonico, WAL IndexedDB e
  merge idempotente, inclusi i messaggi autonomi prodotti durante il distacco.
- Verifica automatica: 10/10 test lifecycle, 46/46 test trasporto/cursore/WAL/SSE/
  push e suite completa 132/132 verdi; TypeScript, build Vite, sync Capacitor,
  Gradle `assembleDebug` e lint dei soli file modificati verdi.
- Il lint globale conserva debito storico fuori dal checkpoint e non viene
  dichiarato verde. La prova fisica Android resta da eseguire quando telefono e
  workstation saranno di nuovo raggiungibili sulla stessa rete.

## [1.0.14 — Scoped resources + Android wireless test transport] — 2026-09-04

- Download APK, galleria, wallpaper/avatar, audio voce, MJPEG e WebSocket
  chiamate consumano URL/token scoped a breve durata senza mettere la chiave
  primaria nelle URL.
- Aggiunto il flusso operativo ADB via LAN: update-preserving install, reverse
  tunnel, pairing della configurazione WebView e avvio remoto, tutti vincolati
  al seriale hardware del telefono.
- Prova fisica: build 114 installata due volte attraverso il seriale ADB di
  rete; backend/XTTS/avatar reverse attivi e configurazione
  protetta validata senza stampare la credenziale.
- Il primo smoke dopo pairing non mostra piu errori history/SSE/presence; resta
  rosso il finding indipendente Firebase non configurato. Una falsa positività
  proveniente da un vecchio crash di un'altra app è stata rimossa limitando il
  crash scan al package/PID Kael.

## [Unreleased — Gate A crash-safe text chat] — 2026-09-04

### Associazione autenticata APK ↔ runtime
- La configurazione backend salva una candidata soltanto dopo due prove distinte: `/health` pubblico e `/auth/verify` protetto. La migrazione di boot può correggere l'URL di discovery senza cancellare né stampare la chiave.
- Il client HTTP centrale, chat, TTS, agente esterno e manifest aggiornamenti sul medesimo origin trasmettono `X-KAEL-KEY`; un override del manifest su origin diverso non riceve mai la credenziale.
- I body JSON devono contenere un singolo documento completo: whitespace JSON è ammesso, prefissi HTML/commenti o spazzatura vengono respinti invece di essere ripuliti silenziosamente.
- Un rifiuto di autenticazione mette l'envelope durevole in `authentication_required`: resta una barriera FIFO visibile e può essere ritentato manualmente con lo stesso UUID/body dopo aver corretto l'associazione.
- Download diretto, MJPEG/media HTML e WebSocket usano ora token scoped
  monouso/a breve durata e vincolati a metodo/percorso; il rollout default-deny
  e stato provato sul runtime locale e resta soggetto alla chiusura completa del
  Gate A.

### Outbox e identità logica
- Il testo viene accettato dalla UI soltanto dopo aver salvato in IndexedDB, con transazione `strict`, l'envelope esatto e il `client_message_id` UUID generato dal client.
- Boot, foreground, reconnect e invio convergono su un solo drain FIFO single-flight. Ogni retry riusa lo stesso ID e lo stesso body verificato via SHA-256; nessun body viene scritto nei log.
- Gli esiti backend sono classificati senza bolle sintetiche: reply, replay idempotente, `SILENCE`, `in_progress`, errore retryable, `recovery_required` e fallimento terminale.
- Il classificatore è allineato ai valori canonici backend (`processing`, `complete`, `silence`, `recovery_required`); eventuali alias storici sono marcati compatibilità non autorevole. Una collisione chiave/payload HTTP 409 resta terminale.
- `recovery_required` e fallimenti terminali restano ispezionabili nell'outbox e non vengono reinviati alla cieca; l'outbox è bounded a 100 record e blocca nuovi invii quando piena.

### Inbox WAL e cursore
- Le pagine timeline passano da un WAL IndexedDB: messaggi, cursore monotono e rimozione del batch vengono committati atomicamente prima del merge React e del mirror `localStorage`.
- I batch rimasti staged per process-death vengono recuperati al boot; la cache timeline è bounded a 1.500 righe.
- Corretto il dedup: `client_message_id` identifica il turno USER; una risposta ASSISTANT può ecoarlo come nesso causale senza essere rimossa come duplicato.

### Verifica diagnostica e confini
- Aggiunti test Vitest per contratti HTTP/classificatore/dedup e una batteria Playwright IndexedDB/reload separata (`npm run e2e:chat-continuity`). È diagnostica browser, non live acceptance.
- Checkpoint locale riverificato il 2026-09-04: Vitest 122/122, Playwright continuity 8/8, Playwright contract 2/2, `tsc --noEmit`, lint dei soli file modificati e build Vite di produzione verdi. Il lint globale conserva debito storico fuori da questo intervento e non viene dichiarato verde.
- La build Android e installata e associata sul dispositivo reale anche via
  rete. Restano da chiudere stop/restart con ricevuta e i fault F0–F7 sul
  runtime Arrakis/PostgreSQL reale della PR #25.
- Questo Gate A copre soltanto la chat testuale. Upload immagine, nota vocale e chiamate richiedono un futuro envelope durevole specifico per blob/asset.
- Il trasporto `POST /chat` resta request/response: SSE notifica nuovi turni ma non è token streaming della risposta. Il vero streaming richiede un contratto backend resumable separato.

---
## [1.0.13 — Swipe-to-reply cognitivo] — 2026-08-12

- Aggiunta gesture hold-then-drag verso destra sulle bolle, con soglia, feedback elastico e cancellazione sullo scroll verticale.
- La gesture usa il payload quote già previsto dalla chat; la preview resta cosmetica e il backend risolve il contenuto completo dalla timeline canonica.
- Aggiunti test failure-sensitive: hold+drag seleziona, swipe ordinario non seleziona, movimento verticale annulla.
- Verifica: 76 test Vitest passati in 12 file e build Vite di produzione completato.
- Versione allineata in UI, package e Android a `1.0.13` / versionCode `113`.

---
## [1.0.12 — Durable delivery, native push e batterie E2E] — 2026-08-12

### Consegna chat
- Sostituito il reload integrale al resume con cursore persistente `conversation_turns.id`, catch-up bounded e merge idempotente.
- SSE è ora un segnale live; i turni vengono sempre riletti dalla timeline autorevole.
- Aggiunti test di sincronizzazione SSE/cursore e contratti API.

### Push Android fail-closed
- Integrato `@capacitor/push-notifications` con installation ID stabile, registrazione token backend e bridge notifica → sync timeline.
- Il plugin parte solo con `VITE_KAEL_FIREBASE_PUSH_ENABLED=true` e `/mobile/push/status.configured=true`.
- Riprodotto e corretto il crash cold-start `Default FirebaseApp is not initialized` quando mancano le risorse Android.
- Il contenuto delle notifiche rimane privato per default; il token non viene scritto nei log.

### Affidabilità APK e contratti
- Corretti contratti Calls/voice e testo italiano della videochiamata; capability UI allineate alla verità backend.
- Aggiunte batterie Playwright separate `ui`, `contracts` e `live` con matrice in `docs/E2E_TEST_MATRIX.md`.
- Versione Android aggiornata a `1.0.12` / versionCode `112`.

### Verifica
- Vitest: 73/73 test passati in 11 file; hook native push: 5/5.
- Build Vite, sync Capacitor e Gradle `assembleDebug` passati con Java 21.
- Smoke USB su Samsung SM-S908B: app foreground, backend/brain ready, permessi concessi, zero crash/errori di boot.
- Il test FCM con app terminata resta subordinato all'aggiunta delle credenziali Firebase Android e server.

---
## [K-2 — APK Reliability] — 2026-05-19

### Fix K-2.2: SSE source whitelist mismatch
**File modificato**: `src/hooks/useKaelSSE.ts`
- `AUTONOMOUS_SOURCES`: aggiunti `"autonomy"` e `"arrakis_autonomy"`
- **Root cause**: backend `sse_notifier._AUTONOMOUS_SOURCES` include queste varianti; APK le filtrava silenziosamente → messaggi autonomi ignorati anche quando il backend li emetteva

### Fix K-2.3: Capacitor appStateChange per history reload affidabile
**File modificato**: `src/pages/Chat.tsx`
- Import aggiunto: `App as CapApp` da `@capacitor/app`
- Nella `useEffect` visibility/resume: aggiunto listener `CapApp.addListener("appStateChange")`
  - Su `isActive=true`: `historyLoadedRef.current = false` + `fetchAndAppendPending()`
  - **Root cause**: `visibilitychange` browser non si attiva affidabilmente su Android/Capacitor al resume; i messaggi sparivano perché nessun reload veniva triggerato dopo foreground
  - Cleanup: `capListener?.remove()` nel return dell'effect

### ⚠️ Nota build
**Questi fix RICHIEDONO rebuild APK** per essere installati sul device:
```powershell
cd kael_nexus_hub
.\build_apk.ps1 -Mode prod
```
Poi reinstalla `android/app/build/outputs/apk/app-release-signed.apk`.

---
## [Unreleased] — 2026-05-13

### Fix: network-resilience-parity — cellular→WiFi reconnect now works correctly

**Root cause confirmed (forensic)**:
- `handleConnectionChange` returned early if `stateRef.current !== "online"`, so
  network changes arriving while the app was in `backend_unreachable` / `offline_network` /
  `offline` / `start_failed` were silently swallowed — no retry was scheduled.
- The manual Reconnect button called `runProbe(true)` directly with no warmup,
  while the background→foreground path used `RESUME_WARMUP_MS = 800ms`. Android needs
  warmup after any network transition to stabilize DNS/TCP/routing.
- No probe-epoch guard: a timed-out stale probe could overwrite the state written
  by a faster, newer probe racing to complete.

**Changes — `src/hooks/useBackendLifecycle.ts`**:
- `PROBE_TIMEOUT_MS` bumped from 4000 → 6000ms. Non-blocking on happy path (probes
  that succeed resolve via microtask, not timer).
- Added `NETWORK_RECONNECT_WARMUP_MS = 800ms` constant (same value as `RESUME_WARMUP_MS`,
  kept separate for clarity).
- `handleConnectionChange` now handles ALL states:
  - `"checking"` or probe running → no-op;
  - `"online"` → `checkHealth()`, if KO → `retry({ withWarmup: true, reason: "network_change_health_fail" })`;
  - `"backend_unreachable" | "offline_network" | "offline" | "start_failed"` →
    `retry({ withWarmup: true, reason: "network_change_degraded" })` immediately.
- `retry(opts?: RetryOptions)` now accepts `{ withWarmup?, reason? }`. Default `withWarmup=true`.
  Applies `NETWORK_RECONNECT_WARMUP_MS` delay before `runProbe`. The visibility-change
  handler passes `withWarmup: false` (it already has an external `RESUME_WARMUP_MS` delay).
- Added `probeEpochRef` race-condition guard: each `runProbe` captures its epoch on entry;
  state writes are skipped if epoch is superseded; `finally` only releases the lock for
  the current epoch.
- Added log markers: `NETWORK_CHANGE_DETECTED`, `NETWORK_CHANGE_RETRY_SCHEDULED`,
  `RECONNECT_WARMUP_BEGIN`, `PROBE_EPOCH_SUPERSEDED`, `RECONNECT_SUCCESS_AFTER_NETWORK_CHANGE`,
  `RECONNECT_FAILED_AFTER_NETWORK_CHANGE`.
- Exported `RetryOptions` interface; updated `BackendLifecycleResult.retry` type accordingly.

**New — `src/test/network-resilience.test.ts`**:
- 6 tests covering all new behaviors (A–F). All pass, ~1.5s total.
- No backend changes, no rebuild scope creep.

---
## [Unreleased] — 2026-05-10

### Fix: nexus: stabilize autonomous pending message ordering
- **src/pages/Chat.tsx — MODIFIED**:
  - Aggiunto `pendingRetriggerTimerRef` per tracking del deferred retry timer.
  - Il guard di coalescing (700ms) ora schedula un retry garantito invece di fare `return` secco.
  - **Root cause**: due messaggi autonomi in burst (< 700ms tra loro) causavano la perdita del secondo messaggio: il trigger veniva scartato silenziosamente se arrivava nella finestra di coalescing, e il primo fetch poteva non includere il secondo messaggio (race con la persistenza backend).
  - **Behavior change**: il retry spara una volta sola dopo la finestra scaduta (+50ms buffer), garantendo che qualsiasi messaggio autonomo persistito dopo il fetch in-flight venga recuperato.
  - Non tocca backend, voice-note contract, M16, memoria, prompt.
- **src/test/chat-reliability.test.ts — MODIFIED**:
  - Aggiunto test F: due messaggi autonomi con ts vicini → ordine cronologico corretto post-merge.
  - Aggiunto test F2: burst merge idempotente (entrambi i messaggi in una singola risposta pending non generano duplicati).
  - 50 test totali, 0 failed.

---
## [Unreleased] — 2026-04-12

### Fix: APK strips free-form internal markers and renders semantic assistant bubbles
- **src/lib/chat/diagnosticMarkers.ts — MODIFIED**:
  - Expanded bracketed marker normalization from uppercase-only markers to any bracketed internal directive text.
  - Impact: APK now strips leaked payload fragments like `[Generating response...]` and `[non specificare ...]`, not only uppercase diagnostic flags.
- **src/pages/Chat.tsx + src/components/chat/MessageBubble.tsx + src/types/index.ts — MODIFIED**:
  - Added APK support for assistant `bubbles` payloads from live replies and history reloads.
  - Assistant bubbles now render as separated stacked chunks instead of a single collapsed text block.
  - Impact: semantic multi-bubble assistant replies are visually separated in the APK, reducing the perceived autonomy/message grouping collapse.
- **src/test/chat-diagnostic-markers.test.tsx — MODIFIED**:
  - Added regression coverage for free-form marker stripping and assistant bubble rendering.
  - Impact: protects both APK marker cleanup and semantic bubble rendering from regression.

### Fix: History/restart merge preserves chronological order
- **src/pages/Chat.tsx — MODIFIED**:
  - `mergeHistoryIntoState()` no longer sorts backend history by `backend_turn_id` before timestamp.
  - The history/restart merge path now follows the same canonical ordering as the chat reliability helper: `timestamp` first, `backend_turn_id` only as tie-breaker, stable `id` last.
  - Impact: prevents history reload and post-restart merges from reintroducing the old visual symptom where assistant messages bunch together and user messages bunch together instead of staying interleaved chronologically.

### Fix: APK chat freeze hardening (watermark + pending debounce)
- **src/pages/Chat.tsx — MODIFIED**:
  - Added `getMaxTimestamp()` helper to centralize timestamp extraction and avoid drift across history/restart paths.
  - History load watermark no longer falls back to `Date.now()` on failure/empty payload. `lastFetchTsRef` now advances only from confirmed backend timestamps.
  - Server-restart history merge path no longer forces watermark to `Date.now()` when backend history has no timestamps.
  - Added `lastPendingFetchStartedAtRef` with a 700ms coalescing window to suppress burst duplicate fetches from simultaneous lifecycle events.
  - Impact: prevents pending-message loss after transient history failures and reduces reconnection fetch storms that can freeze chat UX.

### Fix: SSE reconnect stale-callback guard
- **src/hooks/useKaelSSE.ts — MODIFIED**:
  - Added `reconnectGenerationRef` so delayed reconnect callbacks are ignored if superseded by a newer reconnect request.
  - Impact: avoids stale reconnect callbacks racing against current lifecycle state during rapid background/foreground transitions.

### Fix: Faster route failover (WiFi -> Tailscale/alt host)
- **src/hooks/useBackendLifecycle.ts — MODIFIED**:
  - Added first-failure fast re-discovery path while device is online: on the first `/health` miss, lifecycle immediately triggers `probeAndResolveBackend()` instead of waiting full grace windows.
  - Added cooldown (`FAST_FAILOVER_REDISCOVERY_COOLDOWN_MS`) to avoid probe storms while preserving quick route switch recovery.
  - Impact: when current route drops (e.g. adb reverse/WiFi path), app can recover faster to alternative hosts (including Tailscale) before declaring offline.

### Fix: Build truth and lockfile policy
- **build_apk.ps1 — MODIFIED**:
  - Added strict prod config validation: `capacitor.config.prod.ts` must exist and must not define `server.url`.
  - Added lockfile authority checks: build now requires `package-lock.json`; if `bun.lock`/`bun.lockb` exist, script warns and states npm lockfile is authoritative.
  - Impact: removes ambiguous build semantics and enforces deterministic npm-based APK builds.

### � Fix: Message dedup, ordering, and image client_message_id
- **`src/pages/Chat.tsx` — MODIFIED**: `fetchAndAppendPending` ora controlla sia `backend_turn_id` che `client_message_id` per la dedup (prima solo `backend_turn_id` → messaggi ottimistici duplicati dopo SSE reconnection). `handleImageUpload` ora assegna `client_message_id: crypto.randomUUID()` al messaggio immagine utente (prima assente → impossibile dedup prima dell'ACK). Aggiunto sort per `backend_turn_id` numerico in `mergeHistoryIntoState` e `fetchAndAppendPending` per garantire ordine cronologico stabile (messaggi local-only senza backend_turn_id restano in coda).

### �📸 Feature: Staged photo preview — caption before send
- **`src/components/chat/ChatInput.tsx` — MODIFIED**: Foto da galleria o fotocamera non vengono più inviate immediatamente. Viene mostrata un'anteprima (thumbnail 80x80) sopra l'input con pulsante X per rimuoverla. L'utente può scrivere un commento/caption prima di premere Send. Il placeholder cambia in "Commenta la foto..." quando una foto è staged. Il bottone Send è attivo anche senza testo se c'è una foto staged. Object URL revocato correttamente al cleanup.

### ✏️ Feature: Edit message — long-press con feedback visivo
- **`src/types/index.ts` — MODIFIED**: Aggiunto campo `isEditing?: boolean` a `ChatMessage`.
- **`src/components/chat/ChatInput.tsx` — MODIFIED**: Nuovo stato `editingMessageId`. Banner viola "Modifica messaggio" con X per annullare. Evento `kael-edit-message` ora include `messageId`. Importata icona `Pencil`. Nuovo prop `onCancelEdit`.
- **`src/pages/Chat.tsx` — MODIFIED**: `handleEditMessage` ora marca il messaggio come `isEditing` (dimmed) invece di rimuoverlo. Nuovo callback `handleCancelEdit` per ripristinare. `handleSend` rimuove il messaggio editato e le risposte successive al momento del re-invio. Prop `onCancelEdit` passato a `ChatInput`.
- **`src/components/chat/MessageBubble.tsx` — MODIFIED**: Bubble con `isEditing=true` mostrata con opacità 40% e scala ridotta (0.98) con transizione animata.

---
## [Unreleased] — 2026-03-30

### 🔊 Fix: Voice response — delivery_mode missing in handleVoiceNote
- **`src/pages/Chat.tsx` — MODIFIED**: `handleVoiceNote()` — aggiunto `delivery_mode: "voice_note"` al `responseMsg` quando il backend risponde con `voice_audio`. Prima il campo era assente → la bolla mostrava sia audio player che testo ridondante sotto.

### 🎙️ Fix: Microphone permission — richiesta esplicita prima della registrazione
- **`src/components/chat/ChatInput.tsx` — MODIFIED**: Importato `requestMicrophonePermission()` da `@/lib/permissions`. `toggleRecording()` ora richiede permesso esplicito PRIMA di `getUserMedia`. Se negato, mostra toast e non tenta la registrazione. Risolve il problema su Android dove il dialogo di permesso non appariva.

---
## [Unreleased] — 2026-03-28

### 🔊 Fix: Voice pipeline — delivery_mode fallback

---
## [Unreleased] — 2026-07-11

### �️ Fix: Netharion filtro eventi rilevanti (BUG A)
- **`src/components/common/NetharionRealEventsSheet.tsx` — MODIFIED**: Aggiornata descrizione viewMode 0 per riflettere i nuovi criteri di filtro.

### �🔌 Fix: Disconnessioni APK (Grace + Warmup + SSE Gate + Logging)
- **`src/hooks/useBackendLifecycle.ts` — MODIFIED**:
  - **2A**: `effectiveGrace` da 2 a 4 (120s tolleranza, copre risposte LLM lunghe).
  - **2B**: Aggiunto `RESUME_WARMUP_MS = 800` — delay prima di probe dopo resume da background (Android DNS/TCP restore).
  - **2B**: `handleVisibilityChange` → `retry()` wrappato in `setTimeout(..., RESUME_WARMUP_MS)` con guard `mountedRef + !isRunningRef`.
  - **Logging**: Aggiunto tipo `DisconnectReason`, `disconnectReasonRef`, e `console.warn` a ogni transizione offline/unreachable con motivo specifico.
  - **Interface**: `BackendLifecycleResult.disconnectReason` esposto nel return.
- **`src/hooks/useKaelSSE.ts` — MODIFIED**:
  - **2C**: Rimosso gate `enabledRef.current` da `onVisibilityChange` e Capacitor `appStateChange` — SSE si riconnette al resume indipendentemente dallo stato health.
  - Aggiunto commento esplicativo sulla rimozione del gate.

---

## [Unreleased] — 2026-03-26

### 🎯 Fix A: Netharion Long-Press — Filtro Rilevanza
- **`src/lib/api/netharion.ts` — MODIFIED**: Aggiunta `filterRelevantEvents()` — filtra eventi sopra soglia (admitted OR resonance ≥ 0.50 OR thresholds+resonance ≥ 0.30) invece di mostrare solo transizioni colore/modo.
- **`src/components/common/NetharionRealEventsSheet.tsx` — MODIFIED**: 3 modalità vista: Rilevanti (default) / Transizioni / Tutti. Il toggle cicla tra le 3 modalità. Descrizione dinamica sotto il titolo. Highlight su eventi rilevanti quando si è in vista Transizioni/Tutti.

### 🔊 Fix B: Delivery Mode Contract
- **`src/types/index.ts` — MODIFIED**: Aggiunto tipo `DeliveryMode` (`"text" | "voice_note" | "image" | "video_message" | "voice_call"`) e campo `delivery_mode?: DeliveryMode` a `ChatMessage`.
- **`src/pages/Chat.tsx` — MODIFIED**: `mapBackendMsg()` mappa `delivery_mode` dal backend. Response handler include `delivery_mode`.
- **`src/components/chat/MessageBubble.tsx` — MODIFIED**: Testo nascosto quando `delivery_mode === "voice_note"` e `audioUrl` presente — evita testo ridondante sotto il player vocale.

### 🔄 Fix F: SSE Reconnect su Resume App
- **`src/hooks/useKaelSSE.ts` — MODIFIED**: Aggiunto listener `visibilitychange` + Capacitor `appStateChange` per riconnessione SSE immediata quando l'app torna in primo piano. Reset backoff a 1s al resume.

### 🔐 Fix G: Permessi Android Runtime
- **`android/app/src/main/AndroidManifest.xml` — MODIFIED**: Aggiunti `RECORD_AUDIO`, `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.
- **`src/lib/permissions.ts` — CREATED**: Helper runtime per richiedere permessi microfono, camera, posizione via getUserMedia/Geolocation API. Trigger nativo Android al primo uso.
- **`src/components/chat/ChatInput.tsx` — MODIFIED**: Toast errore su mic permission denial: "Accesso al microfono negato. Abilita il permesso nelle impostazioni."

### 🎵 AudioMessage — Upgrade da Git
- **`src/components/chat/AudioMessage.tsx` — REPLACED**: Sostituito con versione migliorata dal repo remoto:
  - `useMemo` per barre stabili (no re-render su ogni cambio stato)
  - 32 barre (era 24), seeded random heights via `Math.sin`
  - Click-to-seek sulle barre (`handleSeek`)
  - `loadedmetadata` listener per durata reale audio
  - Menu 3-dot `MoreVertical` con dropdown "Scarica audio" (sostituisce bottone download fisso)
  - Stili distinti user/kael (primary-foreground vs neon-purple)
  - `min-w-[200px]` per layout stabile

### 👎 Conferma Feedback Negativo
- **`src/components/chat/MessageActions.tsx` — MODIFIED**: Popup di conferma "Sei sicura del feedback negativo?" con bottoni Sì/No prima di inviare il dislike. Previene feedback negativi accidentali.

### 📝 Impact
- **Tailscale failover**: Verificato — IP `100.89.31.50` corrisponde a KNOWN_HOSTS in `client.ts`. Il codice di failover è corretto (parallel scan, fast grace 60s). Il problema è lato telefono: Tailscale Android non si attiva automaticamente quando WiFi cade. Soluzione: attivare "Always-on VPN" nelle impostazioni Android.

---

## [Unreleased] — 2026-03-25
### 🔧 Fix Voice/Image/Message Pipeline (3 bug critici)
- **`src/lib/api/chat.ts` — MODIFIED**: Aumentato `CHAT_TIMEOUT` da 90s a 180s. Il pipeline LLM (30s) + TTS (60s) superava il timeout di 90s, causando la perdita sistematica dei vocali generati dal backend. Il backend completava la risposta ma il client aveva già chiuso la connessione.
- **`src/pages/Chat.tsx` — MODIFIED (reconcile)**: Aggiunto `fetchAndAppendPending()` dopo 5s in tutti i catch di `handleSend`, `handleImageUpload`, `handleVoiceNote`. Se il backend completa la risposta dopo un timeout client, il messaggio viene recuperato automaticamente invece di andare perso.
- **`src/pages/Chat.tsx` — MODIFIED (message persistence)**: Riscritta logica di caricamento history con strategia **merge** invece di **replace**. I messaggi locali ora persistono nello state React tra ricaricamenti — come l'app Claude: i messaggi sono già lì quando apri la chat, senza flash. Introdotto helper `mergeHistoryIntoState()` che preserva messaggi locali non ancora persistiti e mantiene il feedback dell'utente.
- **`src/pages/Chat.tsx` — MODIFIED (server restart)**: Il handler `kael-server-restarted` non resetta più `historyLoadedRef`/`setHistoryLoading(true)` (che causava lo sparire e riapparire dei messaggi). Ora fa un soft merge asincrono: carica la history dal backend e la fonde con lo state locale senza flash.
- **`src/pages/Chat.tsx` — MODIFIED (DRY)**: Estratto helper `mapBackendMsg()` per centralizzare il mapping backend→ChatMessage. Usato da `mergeHistoryIntoState`, `fetchAndAppendPending` e history load.
- **Root cause messaggi spariscono**: `setMessages(data.messages.map(...))` faceva un replace totale → schermo vuoto per ~200ms → messaggi riappaiono. Il `kael-server-restarted` event resettava `historyLoadedRef = false` + `lastFetchTsRef = 0`, triggando il reload distruttivo ogni volta che la health check perdeva un battito.
- **Root cause vocali**: Pipeline totale 92s (LLM 31s + TTS 61s) > CHAT_TIMEOUT 90s. Il vocale veniva generato e salvato su disco ma mai ricevuto dal client.
### 🤖 Ripristino Toggle Agente Esterno in BottomNav
- **`src/components/layout/BottomNav.tsx` — MODIFIED**: Aggiunto floating toggle button agente (posizione assoluta `left-2 top-2`, speculare al ReconnectButton a destra). Il toggle emette l'evento `kael-agent-mode-changed` che `Chat.tsx` già ascoltava ma che nessun componente emetteva (bug critico introdotto quando `ExternalAgentChat.tsx` è stato eliminato il 2026-03-24). Quando attivato: glow blu neon + navigazione automatica a `/` (chat). Griglia 6 colonne invariata, padding simmetrico `px-12`.
- **Root cause**: L'integrazione di ExternalAgentChat in Chat.tsx ha rimosso il link da BottomNav e la pagina dedicata, ma il listener `kael-agent-mode-changed` in Chat.tsx non aveva più nessun emettitore → agent mode permanentemente morto.
- **Impatto**: L'utente può di nuovo attivare/disattivare la modalità agente esterno dalla navbar. I messaggi dell'agente appaiono nella chat condivisa con differenziazione visiva (bolla blu, avatar cerchio blu, nome in neon-blue vs neon-purple di Kael).
### � Fix Bottom Nav — icone sbilanciate a sinistra
- **`src/components/layout/BottomNav.tsx` — MODIFIED**: Corretto `grid-cols-7` → `grid-cols-6`. La griglia aveva 7 colonne per 6 elementi (5 nav + Spotify), lasciando la 7a colonna vuota. Combinato con `pr-12` (padding per il ReconnectButton floating), le icone risultavano visivamente schiacciate a sinistra. Ora 6 colonne per 6 elementi = distribuzione uniforme.
- **Root cause**: `grid-cols-7` con solo 6 item + `pr-12` creava ~14.3% + 48px di spazio morto a destra.
- **Impatto**: Le icone del bottom nav sono ora centrate e distribuite uniformemente.

### �🔊 Fix Messaggi Vocali — voice_audio data URI
- **`src/pages/Chat.tsx` — MODIFIED**: Aggiunta funzione `normalizeAudioUrl()` che prefissa `data:audio/wav;base64,` al raw base64 restituito dal backend. Il browser/WebView richiede un data URI valido, non un raw base64 string. Applicata a tutti i 5 punti dove `audioUrl` viene assegnato (history load, pending messages, chat response, image-chat response, voice-note response).
- **Impatto**: I messaggi vocali (sia da chat normale che da autonomi) ora sono riproducibili nell'APK. Prima `new Audio(rawBase64)` falliva silenziosamente.

### 🔔 Fix Popup Messaggi Autonomi — toast su chat page
- **`src/components/layout/AppShell.tsx` — MODIFIED**: Il `KaelSSEBridge` ora mostra un toast di preview (3s) anche quando l'utente è sulla pagina chat ("/") e l'app è visibile. Prima veniva silenziosamente appendato senza alcun feedback visivo.
- **Impatto**: L'utente vede sempre un popup di anteprima quando arriva un messaggio autonomo, indipendentemente dalla pagina attiva.

### 🧹 Eradicazione Codice Non Canonico
- **`src/lib/api/chat.ts`**: Rimossa `regenerateResponse()` — endpoint `/chat/regenerate` inesistente nel backend.
- **`src/pages/Chat.tsx`**: Rimosso `handleRegenerate` callback e prop `onRegenerate` da `<MessageBubble>`.
- **`src/components/chat/MessageActions.tsx`**: Rimosso bottone Rigenera (RefreshCw icon), rimossa prop `onRegenerate`.
- **`src/components/chat/MessageBubble.tsx`**: Rimossa prop `onRegenerate` da interfaccia e destructuring.
- **`src/lib/api/services.ts`**: Rimosso commento stale "⚠️ CRITICAL: These endpoints are NOT yet implemented" — il backend `services_hub/router.py` È implementato.

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
