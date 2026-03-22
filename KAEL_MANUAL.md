# 📖 KAEL COMPANION — Manuale Tecnico Completo

> Documento di riferimento per agenti AI e sviluppatori che lavorano al progetto Kael Companion.
> Versione corrente dell'app: **1.0.8** (build 108)

---

## 🏗️ ARCHITETTURA GENERALE

### Stack Tecnologico
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Routing**: react-router-dom v6
- **State**: React Context (theme), useState/useCallback hooks
- **Backend**: API REST esterna (Python FastAPI) — nessun backend integrato in Lovable Cloud per la logica Kael
- **Mobile**: Capacitor (Android APK sideloaded, live-reload via `server.url`)
- **App ID**: `app.lovable.kael.companion`

### Landscape Mode
- **Supporto completo**: L'app funziona in landscape senza interruzioni
- **Safe areas**: `safe-left` / `safe-right` applicati all'AppShell per gestire notch e punch-hole laterali
- **Layout compatto**: Quando `max-height ≤ 500px` (landscape su telefono), header e nav si riducono in altezza
- **Nessuna interruzione**: La rotazione del telefono NON causa remount dei componenti React — invio/ricezione messaggi, riproduzione audio, e tutte le operazioni proseguono senza interruzione
- **Viewport**: `maximum-scale=1.0, user-scalable=no` previene zoom accidentali durante rotazione

### Struttura File Principali
```
src/
├── pages/           # Route principali
│   ├── Chat.tsx     # Chat principale con Kael
│   ├── ExternalAgentChat.tsx # Chat con agente AI esterno (GPT/Claude/Gemini)
│   ├── Calls.tsx    # Chiamate vocali
│   ├── Media.tsx    # Allegati/media condivisi
│   ├── Workspace.tsx # Workspace/progetti
│   ├── Memories.tsx # Ricordi con Kael
│   ├── Settings.tsx # Impostazioni app
│   └── SpotifyCallback.tsx # OAuth callback Spotify
├── components/
│   ├── chat/        # Componenti chat
│   ├── wallpaper/   # Sistema wallpaper per-conversazione
│   ├── layout/      # Header, BottomNav, AppShell
│   ├── common/      # NetharionButton, ConnectionBadge
│   ├── settings/    # Sotto-pagine settings
│   ├── services/    # Hub servizi (GitHub, ecc.)
│   ├── spotify/     # Integrazione Spotify
│   ├── media/       # ImageViewer, TrackCard
│   └── ui/          # shadcn components
├── hooks/           # Custom hooks
├── lib/
│   ├── api/         # Layer API verso backend
│   ├── store/       # Theme store (Context + localStorage)
│   └── constants.ts # Versione app
└── types/           # TypeScript types
```

---

## 📱 PAGINE E NAVIGAZIONE

### Bottom Navigation Bar
| Icona | Label | Route | Descrizione |
|-------|-------|-------|-------------|
| 💬 MessageCircle | Chat | `/` | Chat principale con Kael |
| 📎 Paperclip | Allegati | `/media` | File, immagini, allegati condivisi |
| 🤖 Bot | Agent | `/external-agent` | Chat con agente AI esterno |
| 📁 FolderKanban | Workspace | `/workspace` | Progetti e workspace |

| ⚙️ Settings | Settings | `/settings` | Configurazione app |

### Netharion Button (sopra la nav bar)
Pulsante fluttuante posizionato centralmente sopra la bottom nav.
- **Tipo**: Indicatore di stato a 3 livelli
- **Component**: `src/components/common/NetharionButton.tsx`
- **Stati**:
  - 🟢 `idle` — Sistema OK (hue: 145, verde)
  - 🟠 `warning` — Attenzione (hue: 30, arancione)
  - 🔴 `alert` — Allarme (hue: 0, rosso)
- **Animazione**: `netharion-heartbeat` — pulsazione lenta e organica
- **Backend hook**: Lo stato viene determinato dal backend. Il componente accetta `state` come prop.
- **Punto di integrazione backend**: Il backend deve inviare lo stato via `/netharion/status` o simile → hook che aggiorna `NetharionState`

---

## 💬 CHAT PAGE (`/`)

### Header (`KaelHeader`)
- **Avatar di Kael**: Mostra l'immagine corrente (custom o default)
  - **Long-press sull'avatar** → Apre la galleria del dispositivo per cambiare la foto di Kael
  - La foto viene salvata in `localStorage` come data URI nel theme store (`kaelAvatar`)
  - Toast di conferma: "Foto di Kael aggiornata ✨"
- **Freccia indietro** (`showBack` prop): Presente su tutte le pagine secondarie (Media, Workspace, Memories, Settings). Naviga a `/` (Chat).
  - Icona: `ChevronLeft` da lucide-react
  - Animazione: hover bg + scale su pressione
- **Status dot**: Pallino colorato sotto l'avatar
  - 🟢 Verde = backend online
  - 🔴 Rosso = offline / errore
  - 🔴 Pulsante = in avvio / controllo
- **ConnectionBadge**: Badge testuale sotto il nome "Kael"
- **Bottone chiamata** (📞): Naviga a `/calls`

### Area Messaggi
- **Long-press sullo sfondo vuoto** → Apre il menu wallpaper (NON si attiva su bolle, header, input)
- Scroll automatico ai nuovi messaggi
- Indicatore di typing animato
- Empty state con avatar di Kael e hint "tieni premuto sullo sfondo per personalizzarlo"

### Message Bubble (`MessageBubble`)
- **Sender types**: `user` | `kael` | `external_agent`
- **Contenuti supportati**: testo, immagine, audio, video, track card (Spotify)
- **Azioni**: like/dislike (RLHF), regenerate, TTS playback
- **Markdown**: Le risposte di Kael supportano Markdown completo (GFM)
- **Avatar**: Kael mostra il suo avatar, external agents mostrano il loro o un'iniziale
- **Wallpaper-aware styling**: Le bolle possono adattarsi allo sfondo (glass/gradient/tinted/solid)
- **Stop propagation**: I bubble bloccano l'evento long-press per non triggerare il wallpaper menu

### Long-Press sui Bubble (`BubbleContextMenu`)
- **Long-press su bubble utente**: Mostra menu contestuale con "Modifica messaggio"
  - Il messaggio viene rimosso dalla chat e il testo viene ripopolato nell'input
  - L'utente può correggere e re-inviare
- **Long-press su immagini di Kael**: Mostra "Scarica immagine" → download diretto
- **Long-press su audio di Kael**: Mostra "Scarica audio" → download diretto
- **Pulsante download nei vocali**: Ogni messaggio audio ha un'icona ⬇️ per il download diretto
- **Componente**: `src/components/chat/BubbleContextMenu.tsx`
- **Posizionamento**: Menu contestuale posizionato al punto di pressione, con clamping ai bordi viewport

### Chat Input (`ChatInput`)
- **Icona foto** (🖼️): Apre mini-menu con:
  - "Foto dalla galleria" → `<input accept="image/*">` senza capture
  - "Scatta foto" → `<input accept="image/*" capture="environment">`
- **Campo testo**: Invio con Enter o bottone Send
- **Microfono**: Toggle registrazione vocale (WebM audio)
  - Stato recording: icona quadrata rossa + pulse
- **Bottone Send**: Gradiente neon-purple → accent, disabilitato se vuoto

### Backend API Endpoints (Chat)
| Endpoint | Metodo | Descrizione | File |
|----------|--------|-------------|------|
| `/chat` | POST | Invio messaggio testo | `chat.ts` |
| `/chat/regenerate` | POST | Rigenera ultima risposta | `chat.ts` |
| `/feedback` | POST | RLHF feedback (like/dislike) | `chat.ts` |
| `/chat/image` | POST | Upload immagine per analisi | `chat.ts` |
| `/chat/voice` | POST | Invio nota vocale | `chat.ts` |
| `/chat/history/messages` | GET | Storico messaggi | `chat.ts` |
| `/voice/tts` | GET | Text-to-speech | `voice.ts` |

### ChatResponse (dal backend)
```typescript
{
  reply: string;
  session_id: string;
  message_id?: string;
  assistant_turn_id?: number;
  voice_audio?: string;       // base64 audio TTS
  typing_delay_ms?: number;
  bubbles?: string[];          // multi-bubble response
  image_base64?: string;       // immagine generata
  meta?: Record<string, unknown>;
  sender?: "user" | "kael" | "external_agent";
  agent_id?: string;
  agent_name?: string;
  agent_avatar?: string;
}
```

---

## 🖼️ SISTEMA WALLPAPER PER-CONVERSAZIONE

### Architettura
Il wallpaper è un **layer dedicato** separato dalle immagini chat. NON riutilizza la logica dei messaggi immagine.

### Componenti
| File | Ruolo |
|------|-------|
| `types/wallpaper.ts` | Tipi e costanti |
| `hooks/useChatWallpaper.ts` | Store per-conversazione (localStorage) |
| `hooks/useLongPress.ts` | Rilevamento long-press |
| `components/wallpaper/WallpaperLayer.tsx` | Layer rendering sfondo |
| `components/wallpaper/WallpaperActionSheet.tsx` | Menu azioni (Drawer) |
| `components/wallpaper/WallpaperPreviewSheet.tsx` | Anteprima + controlli visivi |
| `components/wallpaper/WallpaperKaelModeSheet.tsx` | Selezione modalità Kael |
| `components/wallpaper/WallpaperDisplaySettingsSheet.tsx` | Impostazioni display |

### Flow UX
1. Long-press su sfondo chat → **WallpaperActionSheet** (Cambia / Rimuovi / Impostazioni)
2. "Cambia sfondo" → Galleria dispositivo → **WallpaperPreviewSheet** (fit, posizione, blur, overlay, dimness)
3. Conferma → **WallpaperKaelModeSheet** (3 modalità)
4. Salvataggio + toast di conferma

### Modalità Kael (Vision Context)
| Modalità | Descrizione | Sync |
|----------|-------------|------|
| `wallpaper_only` | Solo visivo locale, Kael non riceve | `local_only` |
| `share_once` | Kael analizza una volta, contesto temporaneo | `pending_upload` |
| `persistent_context` | Contesto visivo attivo fino a rimozione | `pending_upload` |

### Display Settings
| Controllo | Range | Default |
|-----------|-------|---------|
| `fitMode` | cover / contain / fill | cover |
| `position` | center / top / bottom | center |
| `blurAmount` | 0–40 px | 4 |
| `overlayStrength` | 0–1 | 0.5 |
| `dimness` | 0–1 | 0.3 |
| `extendGradientToBubbles` | boolean | false |
| `bubbleStyle` | solid / glass / gradient / tinted | solid |
| `bubbleBlurEnabled` | boolean | false |

### Modello Dati (localStorage key: `kael-chat-wallpapers`)
```typescript
{
  [conversationId: string]: {
    conversationId: string;
    wallpaperUri: string;       // data URI
    wallpaperAssetId?: string;  // futuro backend ref
    kaelMode: WallpaperKaelMode;
    displaySettings: WallpaperDisplaySettings;
    lastUpdatedAt: string;      // ISO
    syncStatus: "local_only" | "pending_upload" | "uploaded" | "failed";
  }
}
```

### Contratto Backend Futuro
```typescript
POST /visual-context
{
  conversation_id: string;
  source: "chat_wallpaper";
  mode: "share_once" | "persistent_context";
  active: boolean;
  asset_reference?: string;  // upload token o URL
}
```

### Contesto Ambientale Strutturato (futuro)
```typescript
{
  scene?: string;
  mood?: string;
  palette?: string[];
  symbols?: string[];
  short_summary?: string;
  embedding_ref?: string;
}
```

---

## ⚙️ SETTINGS

### Menu Principale
| Sezione | Icona | Descrizione |
|---------|-------|-------------|
| Profilo Kael | 👤 User | Avatar e identità (nota: avatar ora cambiabile anche via long-press in chat) |
| Personalizzazione | 🎨 Palette | Colori, bolle, sfondo, blur |
| Connessione Backend | 🌐 Globe | URL, API key, test connessione |
| Agente Esterno | 🤖 Bot | API key e modello AI per chat con agenti esterni |
| Foto Kael & Alexièn | 🖼️ ImagePlus | Galleria foto reference per generazione immagini |
| Aggiornamenti | ⬇️ Download | Versione, controllo update remoti |

### Personalizzazione Tema (`ThemeCustomizer`)
| Controllo | Tipo | Effetto |
|-----------|------|---------|
| Theme presets | Bottoni | Applica preset completo (Purple Dream, Rose Glow, Ocean Night, etc.) |
| Accent hue | Slider | Tonalità colore primario |
| Bubble color hue | Slider | Tonalità bolle utente |
| Bubble shape | Bottoni | rounded (16px) / sharp (4px) / pill (24px) / cloud (20px) |
| Background opacity | Slider | Opacità overlay sfondo |
| Background blur | Slider | Intensità blur sfondo |
| Audio bar style | Select | bars / wave / dots / minimal |
| Background image | File upload | Immagine sfondo globale |
| Notification sound | Select | Suono notifica |
| Reset | Button | Ripristina tutti i default |

### Connessione Backend (`BackendConfig`)
| Campo | Tipo | Descrizione |
|-------|------|-------------|
| Backend URL | Input URL | URL base del backend Kael |
| API Key | Input password | Chiave opzionale per autenticazione |
| Salva e Testa | Button | Salva config + health check |
| Status | Badge | idle / checking / ok / error |

### Aggiornamenti (`UpdateSettings`)
| Elemento | Descrizione |
|----------|-------------|
| Versione corrente | APP_VERSION + APP_VERSION_CODE |
| Controlla aggiornamenti | Fetch manifest da backend |
| URL Manifest | Configurazione avanzata URL update |
| UpdateDialog | Modal con changelog, download APK |

---

## 🔌 BACKEND LIFECYCLE

### Hook: `useBackendLifecycle`
Gestisce il ciclo di vita della connessione al backend.

### Stati
| Stato | Significato |
|-------|-------------|
| `checking` | Probe iniziale in corso |
| `online` | Backend sano e raggiungibile |
| `starting` | Sentinel ha avviato il bootstrap |
| `waiting` | Bootstrap lanciato, polling health |
| `start_failed` | Bootstrap timeout o fallito |
| `offline` | Nessun backend, nessun sentinel |

### Auto-Discovery Backend
Il client prova questi URL in ordine:
1. `http://127.0.0.1:8002` — USB via adb reverse
2. `http://192.168.178.78:8002` — Home LAN
3. `http://100.89.31.50:8002` — Tailscale VPN

### Sentinel (porta 8099)
Server leggero sempre attivo che può svegliare il backend principale.
- `GET /health` → verifica sentinel attivo
- `POST /start` → avvia backend principale
- `GET /status` → stato backend + bootstrap

---

## 🤖 EXTERNAL AGENT CHAT (`/external-agent`)

### Panoramica
Chat dedicata per comunicare con agenti AI esterni (OpenAI GPT, Anthropic Claude, Google Gemini) usando la propria API key.

### Architettura
- **Pagina**: `src/pages/ExternalAgentChat.tsx`
- **Config lib**: `src/lib/externalAgent.ts` — gestione config, modelli, invio messaggi
- **Edge Function proxy**: `supabase/functions/external-agent-proxy/index.ts` — proxy server-side per evitare CORS e proteggere le API key
- **Settings**: `src/components/settings/ExternalAgentSettings.tsx` — selezione modello + API key

### Provider Supportati
| Provider | Modelli | API Endpoint (proxied) |
|----------|---------|----------------------|
| OpenAI | GPT-4o, GPT-4o Mini, GPT-4 Turbo, o1 Preview, o1 Mini | `api.openai.com/v1/chat/completions` |
| Anthropic | Sonnet 4, Sonnet 3.5, Opus 3, Haiku 3 | `api.anthropic.com/v1/messages` |
| Google | Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash | `generativelanguage.googleapis.com` |

### UI delle Bolle
- **Colore diverso per provider**: Verde acqua (OpenAI), Arancione (Anthropic), Blu (Google)
- **Label modello**: Testo piccolo bianco (`text-[9px]`) in alto dentro la bolla dell'assistente, formato: `"Provider · Modello"` (es. "OpenAI · GPT-4o")
- **Bordo colorato**: Le bolle dell'agente hanno un bordo del colore del provider

### Configurazione (Settings → Agente Esterno)
- **API Key**: Input password per la chiave del provider selezionato
- **Selezione modello**: Lista raggruppata per provider con indicatore attivo
- **Persistenza**: `localStorage` key `kael_external_agent_config`
- **Formato**: `{ apiKey: string, modelId: string }`

### Flusso Messaggio
1. Utente invia testo → aggiunto alla cronologia locale
2. Cronologia completa inviata a edge function `external-agent-proxy`
3. Edge function formatta la richiesta per il provider selezionato
4. Risposta convertita in formato unificato → bolla con label modello

---

## 🔑 SESSION MANAGEMENT

- **Session ID canonico**: `mobile_kael` (fisso, non random)
- **Migrazione**: Vecchi UUID random vengono automaticamente sostituiti
- **Storage**: `localStorage` key `kael_session_id`
- **Clear session**: Genera nuovo UUID random (per reset/logout)

---

## 🎵 SPOTIFY INTEGRATION

### Architettura
L'integrazione Spotify opera su due livelli:
1. **Client-side (PKCE OAuth)**: L'utente autorizza l'app via OAuth PKCE. Token gestiti localmente (`kael-spotify-auth`). Usato per playback control e navigazione libreria.
2. **Backend (Kael)**: Il backend gestisce suggerimenti musicali, creazione playlist, e invio spontaneo di brani/playlist in chat.

### Bottom Nav — Bottone Spotify
- **Icona**: SVG Spotify custom (`SpotifyIcon`)
- **Comportamento su Android (Capacitor)**: Tenta deep link `spotify://`, fallback `open.spotify.com` dopo 1.5s
- **Comportamento su web**: Apre `open.spotify.com` in nuova tab
- **Non è una route**: È un launcher esterno, non naviga internamente

### Condivisione Musicale in Chat
Kael può inviare due tipi di card musicali nei messaggi:

#### TrackCard (brano singolo)
- **Componente**: `src/components/media/TrackCard.tsx`
- **Campi**: `title`, `artist`, `albumArt?`, `spotifyUrl?`, `personalMessage?`
- **Messaggio personale**: Testo italic sopra la card (es. "Questa mi ricorda quella sera")
- **Deep link**: Su Android apre `spotify://track/{id}`, fallback web
- **In ChatMessage**: `message.trackCard`

#### PlaylistCard (playlist)
- **Componente**: `src/components/chat/PlaylistCard.tsx`
- **Campi**: `name`, `description?`, `coverArt?`, `trackCount?`, `spotifyUrl?`, `createdByKael?`
- **Badge "Creata da Kael"**: Mostrato quando `createdByKael === true`
- **Deep link**: Su Android apre `spotify://playlist/{id}`, fallback web
- **In ChatMessage**: `message.playlistCard`

### Backend API Endpoints (Spotify)
| Endpoint | Metodo | Descrizione | File |
|----------|--------|-------------|------|
| `/spotify/context` | GET | Now playing + suggerimenti | `api/spotify.ts` |
| `/spotify/state` | GET | Stato connessione Spotify | `api/spotify.ts` |
| `/spotify/state` | POST | Aggiorna stato Spotify | `api/spotify.ts` |
| `/spotify/state` | DELETE | Reset stato Spotify | `api/spotify.ts` |
| `/spotify/playlist/create` | POST | Kael crea playlist per l'utente | `api/spotify.ts` |
| `/spotify/suggestions` | GET | Suggerimenti musicali di Kael | `api/spotify.ts` |

### Tipi API
```typescript
// Richiesta creazione playlist
interface KaelPlaylistRequest {
  name: string;
  description?: string;
  trackUris?: string[];
  mood?: string;
  context?: string;
}

// Risposta creazione playlist
interface KaelPlaylistResponse {
  playlistId: string;
  playlistUrl: string;
  name: string;
  trackCount: number;
}

// Suggerimento musicale (brano o playlist)
interface KaelMusicSuggestion {
  type: "track" | "playlist";
  track?: SpotifyTrack;
  playlist?: PlaylistCardData;
  message?: string; // messaggio personale di Kael
}
```

### OAuth PKCE (Client-side)
- **Client ID**: `79f9fb81523a4aaab30b919b91b84421`
- **Callback**: `/spotify-callback`
- **Scopes**: playback state, library read, playlist read/write, recently played, top read
- **Token storage**: `localStorage` key `kael-spotify-auth`
- **File**: `src/lib/spotify/auth.ts`

### Spotify Web API (Client-side)
- **File**: `src/lib/spotify/api.ts`
- Playback control (play/pause/skip/volume/shuffle)
- Library (saved tracks, playlists, recently played)
- Playlist management (create, add tracks)
- Search tracks

### Componenti UI
| Componente | File | Uso |
|------------|------|-----|
| SpotifyNowPlaying | `spotify/SpotifyNowPlaying.tsx` | Widget now playing |
| SpotifyLibrary | `spotify/SpotifyLibrary.tsx` | Libreria brani/playlist |
| SpotifyMusicTab | `spotify/SpotifyMusicTab.tsx` | Tab musica nella pagina Media |
| SpotifyTrackItem | `spotify/SpotifyTrackItem.tsx` | Riga brano nella libreria |
| TrackCard | `media/TrackCard.tsx` | Card brano in chat/media |
| PlaylistCard | `chat/PlaylistCard.tsx` | Card playlist in chat |
| SpotifyIcon | `common/SpotifyIcon.tsx` | Icona SVG Spotify |

---

## 📋 SERVICES HUB

### Servizi Supportati (tipo)
- GitHub (repo-awareness, issue drafting)
- Notion, Drive, Slack, Calendar (planned)

### GitHub Repo-Awareness
| Endpoint | Descrizione |
|----------|-------------|
| `/agentic/repo/status` | Stato repo corrente |
| `/agentic/repo/analyze` | Analisi repo |
| `/agentic/repo/self_audit` | Self-audit repo |
| `/agentic/repo/draft_issue` | Draft issue da analisi |

---

## 🧪 CAPABILITY SYSTEM

Hook `useCapability<T>` per determinare lo stato delle feature backend:
- `loading` → controllo in corso
- `unavailable` → backend non configurato/raggiungibile
- `error` → endpoint errore
- `empty` → risposta vuota
- `pending` → feature non ancora implementata (404/501)
- `available` → feature attiva con dati

---

## 📐 DESIGN SYSTEM

### CSS Variables (index.css `:root`)
| Variable | Valore HSL | Uso |
|----------|-----------|-----|
| `--background` | 270 30% 8% | Sfondo app |
| `--foreground` | 270 10% 93% | Testo principale |
| `--primary` | 270 80% 65% | Accento primario |
| `--neon-purple` | 270 100% 70% | Neon viola (brand) |
| `--neon-pink` | 310 100% 65% | Neon rosa |
| `--neon-blue` | 240 100% 70% | Neon blu |
| `--glass` | 270 30% 12% | Base glass morphism |
| `--online` | 145 65% 50% | Status online |

### Classi Utility Custom
| Classe | Effetto |
|--------|---------|
| `.neon-text` | Text shadow viola neon intenso |
| `.neon-text-subtle` | Text shadow viola neon leggero |
| `.glass` | Glassmorphism standard (blur 20px) |
| `.glass-strong` | Glassmorphism intenso (blur 30px) |
| `.neon-pulse` | Animazione pulse glow |
| `.netharion-pulse` | Heartbeat lento per Netharion |
| `.typing-dot` | Animazione dots typing |

---

## 📦 PERSISTENZA (localStorage)

| Key | Contenuto |
|-----|-----------|
| `kael-theme-settings` | ThemeSettings completo (colori, avatar, sfondo, etc.) |
| `kael-chat-wallpapers` | Wallpaper per-conversazione |
| `kael_session_id` | Session ID (`mobile_kael`) |
| `kael-backend-config` | `{ baseUrl, apiKey }` |
| `kael-update-manifest-url` | URL override per manifest update |

---

## 🔄 LIVE RELOAD (APK)

L'APK usa `capacitor.config.ts` con `server.url` puntato al preview Lovable.
Tutte le modifiche UI/logica si riflettono istantaneamente senza reinstallare.

**Eccezioni** (richiedono rebuild APK):
- Icona launcher
- Splash screen
- Plugin nativi Capacitor
- `capacitor.config.ts` stesso
