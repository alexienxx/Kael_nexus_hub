# 📝 KAEL COMPANION — Changelog

> Registro cronologico di tutte le modifiche al progetto.
> Aggiornato ad ogni intervento.

---

## [Unreleased] — 2026-03-21

### 🆕 Added
- **Sistema wallpaper per-conversazione**: Long-press sullo sfondo della chat per personalizzare lo sfondo con immagine dalla galleria
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
