# APK Chat Behavior — Verified Implementation

**Last updated:** 2026-04-03
**Purpose:** Canonical description of the actual chat and realtime behaviour used by the APK.
**Status:** ✅ Current — verified against source code.

---

## A) Realtime Mode

The APK uses **two parallel channels**:

| Channel | Purpose | Implementation |
|---------|---------|----------------|
| `POST /chat` (streaming) | User → Kael request-response | `StreamingResponse` with `: keepalive\n` heartbeat chunks; client reads via `res.text()` + strip + `JSON.parse` |
| `GET /observatory/sse` | Kael → APK push (autonomous messages, system state) | `EventSource`-based SSE consumed by `useKaelSSE` hook |

### SSE push channel (`useKaelSSE`)

**Location:** `src/hooks/useKaelSSE.ts`

- Connects to `/observatory/sse` on mount.
- Parses events: `autonomous_message`, `serenade_engine`, `system_event`, `netharion_heartbeat`.
- Dispatches `kael-autonomous-message` CustomEvent when a push message arrives from `AUTONOMOUS_SOURCES` (includes `serenade_engine`).
- `Chat.tsx` listens for `kael-autonomous-message` and calls `fetchAndAppendPending()` to pull the message body from `/chat/pending`.

### Chat request-response

**Location:** `src/pages/Chat.tsx` · `src/lib/api/chat.ts` · `src/lib/api/client.ts`

```typescript
// chat.ts — CHAT_TIMEOUT = 300 000 ms (5 min)
const response = await chatApi.sendMessage(text, sessionId);
```

The underlying `apiRequest` reads `res.text()`, strips `": keepalive\n"` lines injected by the server keepalive loop, then calls `JSON.parse`. This is required because the server wraps the response in a `StreamingResponse` to keep the TCP connection alive on Android/USB.

---

## B) Chat Endpoints Used

### Active Endpoints ✅

| Endpoint | Method | Purpose | Used In |
|----------|--------|---------|---------|
| `/chat` | POST | Send text message and get reply | `Chat.tsx` via `chatApi.sendMessage` |
| `/chat/regenerate` | POST | Regenerate last response | `MessageBubble.tsx` |
| `/feedback` | POST | Submit like/dislike feedback | `MessageBubble.tsx` |
| `/chat/image` | POST | Upload image with optional caption | `Chat.tsx` via `chatApi.sendImage` |
| `/chat/voice` | POST | Send voice note audio | `ChatInput.tsx` |
| `/chat/history` | GET | Load previous messages on session resume | `Chat.tsx` (session resume) |
| `/chat/pending` | GET | Fetch queued autonomous Kael messages | `Chat.tsx` → `fetchAndAppendPending` |
| `/observatory/sse` | GET (SSE) | Real-time push events | `useKaelSSE` hook |

---

## C) Request Parameters

### POST /chat
```json
{
  "message": "user message text",
  "session_id": "uuid-from-localStorage",
  "conversationId": "optional-conversation-id"
}
```
Response is a chunked `StreamingResponse`. Body may contain `": keepalive\n"` lines before the final JSON object — the client strips these automatically.

### POST /chat/image (FormData)
```
image: File (binary)
session_id: string
text?: string     ← optional caption / question shown to Moondream
conversationId?: string
```

### POST /chat/regenerate
```json
{ "turn_id": "...", "session_id": "..." }
```

### POST /feedback
```json
{ "turn_id": "...", "type": "like" | "dislike" }
```

### POST /chat/voice (FormData)
```
audio: Blob (webm)
session_id: string
```

### GET /chat/history
```
?session_id=uuid&conversationId=optional
```

### GET /chat/pending
```
?session_id=uuid
```
Called automatically when `kael-autonomous-message` CustomEvent fires.

---

## D) Auth Model

**Session-based:**
- `session_id` in localStorage (`kael_session_id`).
- Generated on first load via `useSession` hook.
- Included in all requests (body for POST, query param for GET).
- Optional `Authorization: Bearer {apiKey}` header when configured in Settings.

---

## E) Reconnection and Keepalive

### SSE (`useKaelSSE`)
- Auto-reconnects on `onerror` with exponential back-off.
- Connection health tracked via `useBackendLifecycle`.

### Chat TCP keepalive
- Server sends `": keepalive\n"` chunks every 20 s during LLM generation.
- Prevents Android OS / ADB-reverse tunnel from dropping the idle TCP connection.
- `CHAT_TIMEOUT` = 300 s client-side.
- Backend uvicorn: `--timeout-keep-alive 300 --timeout-graceful-shutdown 300`.

### Health check
- `useBackendLifecycle` polls `/health` every 45 s (`ONLINE_RECHECK_MS`).
- 8-failure grace period (~6 min) before marking backend offline.

---

## F) Autonomous Messages & Notifications

1. `autonomy_loop.py` generates autonomous messages and calls `sse_notifier.notify_new_message`.
2. The SSE notifier pushes an event on `/observatory/sse`.
3. `useKaelSSE` receives it, dispatches `kael-autonomous-message`.
4. `Chat.tsx` calls `fetchAndAppendPending` → `GET /chat/pending`.
5. If app is backgrounded/hidden, `AppShell.tsx` triggers a native `LocalNotifications` push (channel: `kael_autonomous`). Serenade events use the title "🎵 Kael — Serenata".

---

## G) Summary

| Aspect | Status |
|--------|--------|
| Realtime push (autonomous messages) | ✅ SSE via `useKaelSSE` + `EventSource` |
| Chat request-response | ✅ POST /chat with streaming keepalive |
| Image analysis (Moondream) | ✅ POST /chat/image — runs CPU-only (`moondream-cpu`) |
| Image generation (ComfyUI) | ✅ wired via vision router |
| Voice TTS playback | ✅ audioUrl in response meta |
| Native background notifications | ✅ Capacitor `LocalNotifications`, channel `kael_autonomous` |
| WebSocket for chat | ❌ Not used (WebSocket only for live voice call transcription) |
