# APK End-to-End Test Matrix

Status: canonical test entrypoint for Kael Companion cross-boundary behavior.

The E2E suite is intentionally split. A failure in Spotify must not prevent call, chat, or workspace evidence from being produced.

| Battery | Command | Backend | Mutations | Responsibility |
|---|---|---|---|---|
| UI deterministic | `npm run e2e:ui` | mocked | none | Route rendering, sub-tabs, settings navigation, uncaught browser errors |
| Chat continuity diagnostic | `npm run e2e:chat-continuity` | mocked HTTP + real browser IndexedDB | local IndexedDB | Exact envelope/UUID across reload, single retry, SILENCE, recovery-required, staged WAL recovery |
| Contract deterministic | `npm run e2e:contract` | mocked with canonical DTOs | local only | Exact APK request payloads, response normalization, visible UTF-8 copy |
| Live read-only | `npm run e2e:live` | local Arrakis `:8002` | GET only | Health, history, SSE, services, calls, Spotify, Observatory, Sheets, agentic DTO truth |
| Frontend unit | `npm test` | none | none | Pure functions, merge/idempotence, network-state logic |
| Web build | `npm run build` | none | generated `dist` | Type/bundle production compilation |
| Android build | `npx cap sync android`, then `gradlew assembleDebug` | none | generated assets/APK | Capacitor sync and native compilation; Java 21 required |
| Android lint | `gradlew lintDebug` | none | reports only | Manifest, permissions, resources and packaging |
| USB smoke | roadmap battery pending | local Arrakis | read-only by default | Installed version, permissions, navigation, logcat, backend correlation |
| Crash-safe live acceptance | separate F0–F7 battery pending | official launcher + real Arrakis/PostgreSQL | controlled chat writes + process kill/restart | One canonical exchange, no loss/duplicate, resumable receipt and coherent cross-client timeline |

## Rules

- Deterministic E2E never requires Spotify, Google, GitHub, Slack, camera, microphone, or external credentials.
- Browser IndexedDB/reload tests are diagnostic and must never be reported as live acceptance, even when Playwright uses a real browser process.
- Live E2E is read-only. Tests that create playlists, Drive files, events, issues, calls, or messages belong in a separately confirmed destructive/external battery.
- Every failure retains a trace, screenshot, video and JUnit report.
- No `test.skip` or `test.fail` may be used to turn an incomplete capability green. An unmet product acceptance criterion remains red outside CI until implemented.
- CI runs deterministic tests only. The live battery runs when Arrakis is explicitly started.
- Gate A acceptance requires an installed APK/device, the official launcher, real PostgreSQL and real runtime boundaries. A mocked route or friendly exception cannot substitute for kill/restart fault injection.
