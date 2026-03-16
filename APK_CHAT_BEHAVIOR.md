# APK Chat Behavior Verification

**Date:** 2026-03-16
**Purpose:** Document the actual chat/realtime behavior used by the APK to eliminate contract drift

---

## A) Actual Realtime Mode

**Result:** **NONE - Request-Response Only**

The APK currently uses a **simple request-response pattern** with **NO** realtime updates:
- ❌ **NO polling** implementation
- ❌ **NO SSE** (Server-Sent Events) implementation
- ❌ **NO WebSocket** for chat (WebSocket only used for voice call transcription)
- ❌ **NO background message fetching**

### Implementation Details

**Location:** `src/pages/Chat.tsx:45-85`

```typescript
const handleSend = useCallback(async (text: string) => {
  // 1. Add user message to UI
  const userMsg: ChatMessage = { id, text, time, sender: "user", feedback: null };
  setMessages((prev) => [...prev, userMsg]);

  // 2. Send to backend and wait for response
  setIsTyping(true);
  const response = await chatApi.sendMessage(text, sessionId);

  // 3. Add Kael's response to UI
  const kaelMsg: ChatMessage = {
    id, text: response.content, time, sender: "kael",
    backend_turn_id: response.turn_id, meta: response.meta, audioUrl: response.tts_url
  };
  setMessages((prev) => [...prev, kaelMsg]);
}, [sessionId]);
```

**Pattern:** Classic synchronous async/await - user sends message → backend responds → UI updates

---

## B) Chat Endpoints Used

### Actually Used Endpoints ✅

| Endpoint | Method | Purpose | Auth | Used In |
|----------|--------|---------|------|---------|
| `/chat` | POST | Send text message and get reply | `session_id` in body | `Chat.tsx:60` |
| `/chat/regenerate` | POST | Regenerate last response | `session_id` + `turn_id` | `MessageBubble.tsx` (via regenerateResponse) |
| `/feedback` | POST | Submit like/dislike feedback | `turn_id` + type | `MessageBubble.tsx` (via submitFeedback) |
| `/chat/image` | POST | Upload image with optional message | `session_id` + FormData | `Chat.tsx:88-130` |
| `/chat/voice` | POST | Send voice note audio | `session_id` + audio blob | `ChatInput.tsx` (via sendVoiceNote) |
| `/chat/history` | GET | Load previous messages | `session_id` query param | Not currently used in UI |

### Defined But UNUSED Endpoints ⚠️

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/chat/pending` | GET | Get autonomous messages from Kael | **NEVER CALLED** - Function exists but unused |

### NOT Implemented / NOT Mentioned ❌

The following endpoints from the issue description are **NOT implemented** in the APK:

- `/chat/context/recent` - Does not exist in code
- `/chat/events` - Does not exist in code (no SSE implementation)
- `/chat/events/token` - Does not exist in code (no SSE auth)

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

### POST /chat/regenerate
```json
{
  "turn_id": "backend-provided-turn-id",
  "session_id": "uuid-from-localStorage"
}
```

### POST /feedback
```json
{
  "turn_id": "backend-provided-turn-id",
  "type": "like" | "dislike"
}
```

### POST /chat/image (FormData)
```
image: File (binary)
session_id: string
conversationId?: string
```

### POST /chat/voice (FormData)
```
audio: Blob (webm format)
session_id: string
```

### GET /chat/history
```
Query params: session_id=uuid&conversationId=optional
```

### GET /chat/pending (UNUSED)
```
Query params: session_id=uuid
```

---

## D) Auth Model

**Session-based authentication:**
- `session_id` stored in localStorage under key `'kael_session_id'`
- Generated on first load via `useSession` hook
- Included in ALL requests (either body for POST, query param for GET)
- Optional `Authorization: Bearer {apiKey}` header if configured in Settings

**Location:** `src/hooks/useSession.ts`

---

## E) Reconnection Behavior

**Result:** **NO reconnection logic exists**

- ❌ No retry mechanisms
- ❌ No exponential backoff
- ❌ No reconnection on disconnect
- ✅ Only basic error handling with toast notifications

**Existing timeout:** 30 seconds per request (configured in `src/lib/api/client.ts`)

**Connection monitoring:** Separate health check polls `/health` every 30 seconds via `ConnectionBadge.tsx` - this is NOT chat-related

---

## F) Contract Drift Findings

### 1. Unused Code - `/chat/pending` endpoint ⚠️

**Location:** `src/lib/api/chat.ts:93-97`

This function is defined but **NEVER imported or called** anywhere in the codebase:
```typescript
export async function getPendingMessages(sessionId: string) {
  return apiRequest<{ messages: ChatMessage[] }>(
    `/chat/pending?session_id=${sessionId}`
  );
}
```

**Recommendation:** Remove this function if backend doesn't support autonomous messages, OR implement polling if backend does support it.

### 2. Misleading Documentation ⚠️

**Location:** `src/lib/api/chat.ts:7-19`

Current documentation states:
```typescript
/**
 * NOTE: The following endpoints are assumed based on frontend needs
 * and require verification with the actual Kael_refactor_ultimate backend:
 * - GET /chat/pending
 */
```

But `/chat/pending` is not actually used, creating confusion.

### 3. No SSE/Events Implementation

Issue mentions `/chat/events` and `/chat/events/token` but:
- No `EventSource` usage in codebase
- No SSE connection code
- No reconnection logic for SSE

If backend supports SSE, APK doesn't use it. If backend doesn't support SSE, the issue description may be outdated.

---

## G) Summary & Recommendations

### Current State (Verified)
✅ **Realtime Mode:** None - pure request-response
✅ **Active Endpoints:** 5 endpoints (chat, regenerate, feedback, image, voice)
✅ **Unused Endpoints:** 1 endpoint (chat/pending)
✅ **Auth:** session_id-based
✅ **Reconnection:** None

### Actions Required

1. **Remove unused code:**
   - Delete `getPendingMessages` function from `chat.ts`
   - Update documentation to reflect actual usage

2. **Update documentation:**
   - Mark verification status for each endpoint
   - Remove misleading "requires verification" notes for endpoints that ARE working
   - Document that polling/SSE is NOT implemented

3. **Store verified contract:**
   - Update repository memory with verified chat architecture
   - Document that WebSocket is ONLY for voice calls, not chat

### Backend Alignment Questions

Based on this audit, the following questions should be answered:

1. **Does the backend support `/chat/pending` for autonomous messages?**
   - If YES → implement polling in APK
   - If NO → confirm removal is correct

2. **Does the backend support SSE via `/chat/events`?**
   - If YES → decide if APK should implement SSE
   - If NO → confirm request-response pattern is correct

3. **Does the backend support `/chat/context/recent`?**
   - Not implemented in APK - is this needed?

---

## H) Non-Chat Timers (For Completeness)

These exist but are NOT related to chat:

1. **Connection Health Check** - `ConnectionBadge.tsx` polls `/health` every 30s
2. **Call Duration Timer** - `Calls.tsx` updates call duration every 1s during active calls
3. **UI Animations** - Various `setTimeout` calls for scroll animations (100ms delays)
