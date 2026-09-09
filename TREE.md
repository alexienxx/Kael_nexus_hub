# Kael Companion — source tree

Aggiornato: 2026-09-05. Questo indice elenca i punti architetturali mantenuti manualmente; artefatti generati (`dist/`, report Playwright e APK) non sono autorità sorgente.

```text
kael_nexus_hub/
├── src/
│   ├── pages/
│   │   └── Chat.tsx                         # UI chat + boot/resume/reconnect integration
│   ├── hooks/
│   │   └── useNetharion.ts                  # sola lettura REST temporanea fino a P0-B
│   ├── components/
│   │   ├── chat/OutboxAttentionPanel.tsx    # retry/rimozione espliciti per invii bloccati
│   │   └── settings/BackendConfig.tsx       # health pubblico + verifica credenziale protetta
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                    # config, auth header e JSON whole-body canonici
│   │   │   ├── chat.ts                      # contratti HTTP chat/history
│   │   │   └── voice.ts                     # TTS/chiamate via client autenticato
│   │   ├── externalAgent.ts                 # proxy agente esterno via client autenticato
│   │   └── chat/
│   │       ├── durableExchangeStore.ts      # IndexedDB: outbox, inbox WAL, timeline, cursor
│   │       ├── textOutbox.ts                # FIFO single-flight e classificatore receipt
│   │       └── reliability.ts               # identità/merge/dedup canonici
│   └── test/
│       ├── api-auth-transport.test.tsx       # migrazione key, auth verify e parser fail-closed
│       ├── chat-api.test.ts                 # envelope HTTP e status tipizzati
│       ├── durable-chat-indexeddb.test.ts    # outbox/WAL e barriera auth persistente
│       ├── chat-reliability.test.ts         # dedup USER/ASSISTANT
│       ├── netharion-rest.test.ts           # nessuna autorità SSE Observatory residua
│       └── text-outbox-classifier.test.ts   # matrice esiti Gate A
├── tests/e2e/
│   ├── support/appFixture.ts                # backend finto diagnostico, mai acceptance live
│   ├── ui/chat-continuity-diagnostic.spec.ts # IndexedDB/reload/WAL nel browser
│   └── live/read-only.spec.ts                # runtime reale; key solo da ambiente
├── docs/E2E_TEST_MATRIX.md                  # separazione diagnostica, live e device
├── KAEL_MANUAL.md                           # libretto operativo APK
├── CHANGELOG.md                             # registro cronologico
└── package.json                             # entrypoint batterie e build
```

## Confini Gate A

- Autorità conversazione: PostgreSQL backend.
- Autorità locale crash-continuity: IndexedDB `kael-chat-continuity`.
- Coperto: testo, citazione inclusa nell'envelope, pending timeline, boot/foreground/reconnect.
- Non coperto: blob immagine, nota/chiamata vocale, token streaming resumable. Questi richiedono contratti dedicati e non sono implicitamente dichiarati affidabili da questo tree.

## Confine P0-A Observatory

- La route APK `/observatory`, i pannelli, gli hook, il client API e l'evento SSE
  dedicato sono rimossi: non esiste una superficie compatibilità parallela al
  runtime Arrakis.
- Netharion non usa più snapshot Observatory. Fino al redesign P0-B legge solo
  il heartbeat REST esistente e non viene dichiarato autorità cognitiva.
