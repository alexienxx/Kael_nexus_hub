# APK chat behavior — canonical implementation

Updated: 2026-09-05

The APK has one durable canonical timeline and one realtime notification path.
PostgreSQL remains the server authority; IndexedDB retains the last committed
timeline and the outbound WAL across offline launches.

## Delivery and recovery

- User text is written to the IndexedDB outbox before `POST /chat`.
- A stable `client_message_id` makes retries idempotent.
- `GET /chat/events` is a notification stream, not message authority.
- `GET /chat/history/pending` retrieves complete rows after the durable turn-ID
  cursor and includes assistant, autonomous and `external_agent` turns.
- `GET /chat/history/mixed` hydrates the visible snapshot, including attributed
  external-agent replies. Snapshot reads never advance the pending cursor.
- Reconnect, foreground resume and backend restart converge on one bounded,
  single-flight catch-up path. Manual Reconnect is optional diagnostics only.
- When the backend is unavailable, committed IndexedDB history remains visible.
  A powered-off local PC cannot create or transmit new turns; that requires a
  separate always-on relay.

## External-agent exchange

The APK calls `POST /services/external-agent/chat` with the selected provider,
model, bounded message history, client session and a stable `exchange_id`
derived from the originating chat message. Provider credentials remain on the
backend. The response is displayed only with its canonical `turn_id` and
secret-free provenance, and reappears through mixed/pending history after a
reload. Provider output is an attributed statement, never automatically truth.

## Netharion

Netharion is only the authenticated external-agent reception channel. The APK
reads `GET /cognition/netharion/channel` and exposes the closed technical states
`OFF`, `ACTIVE`, `RECEIVING`, `VERIFIED`, and `DEGRADED`. Its diagnostics contain
only bounded receipt metadata and content hashes—never message text, presence,
emotion, personality, relationship state or provider secrets.

## Active endpoints

| Endpoint | Purpose |
|---|---|
| `POST /chat` | Durable user-to-Kael exchange |
| `GET /chat/events` | Realtime notification stream |
| `GET /chat/history/pending` | Cursor-authoritative catch-up |
| `GET /chat/history/mixed` | Full visible history snapshot |
| `POST /services/external-agent/chat` | Authenticated, durable external exchange |
| `GET /cognition/netharion/channel` | Metadata-only Netharion diagnostics |
| `POST /chat/image` | Image message |
| `POST /chat/voice` | Voice note |
| `POST /feedback` | Turn feedback |

All protected requests go through the central authenticated client. Resource
downloads use short-lived scoped URLs and never place the primary credential in
a query string.
