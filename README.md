# Arrakis Companion — APK e client web

Client React/TypeScript, Vite e Capacitor Android del progetto Arrakis.
Il nome principale è **Arrakis**; package e identificatori `kael` sono storici.
Il sorgente corrente usa Arrakis per titolo, header, notifiche e superfici
visibili. Le installazioni precedenti possono mostrare ancora Kael finché non
ricevono una build aggiornata; questo non crea una seconda identità.

Unico ordine di lavoro: [roadmap Arrakis / PR26](https://github.com/alexienxx/Kael_refactor_ultimate_new/pull/26).
[PR mobile1](https://github.com/alexienxx/Kael_nexus_hub/pull/1) contiene
l'implementazione di questo client, non una roadmap concorrente.

## Funzionalità e stato

| Superficie | Contratto presente | Limite dichiarato |
|---|---|---|
| Chat | Storico misto, streaming SSE, recupero per cursore canonico, cache/WAL IndexedDB e outbox testo | Un messaggio visibile/provvisorio non sostituisce la ricevuta del backend; verificare errori, replay e persistenza |
| Riconnessione | Retry automatici single-flight con backoff/jitter, eventi rete/ripresa e catch-up | Reconnect è un comando diagnostico aggiuntivo, non un passaggio richiesto. Il server deve essere raggiungibile |
| Netharion / agente esterno | Ricevute tecniche `OFF/ACTIVE/RECEIVING/VERIFIED/DEGRADED`, `exchange_id` stabile e turni esterni durevoli | Non presenza/umore/coscienza. La nuova accettazione provider reale -> DB isolato -> APK117 è ancora aperta |
| Allegati / media | Pagina media, contratti upload/galleria e reference fotografiche | Non certifica consumo cognitivo Vision o rigenerazione ComfyUI; verifiche G12 |
| Chiamate e servizi | Pagine chiamate, workspace, impostazioni e callback OAuth | Dipendono da servizi, credenziali e permessi reali; non tutte live-verified |
| Aspetto | Tema/avatar configurabili, header neon e marchio dorato Arrakis | Package, storage ed eventi `kael` restano alias tecnici di compatibilità |
| Observatory | Rimosso da route, pagine e navigazione | Non ricostruire né usare Netharion come sostituto cognitivo |

Sorgenti principali: [route](src/App.tsx),
[header](src/components/layout/KaelHeader.tsx),
[configurazione backend](src/components/settings/BackendConfig.tsx),
[persistenza scambi](src/lib/chat/durableExchangeStore.ts),
[outbox](src/lib/chat/textOutbox.ts).

## Connessione e uso offline

In Settings configurare l'URL del backend e la chiave tramite il campo protetto.
“Salva e Testa Connessione” verifica backend e autenticazione prima di salvare.
Non inserire chiavi in URL, comandi ADB, log o screenshot condivisi.

Senza rete/backend, la cronologia già ricevuta deve restare leggibile; al
ritorno della connessione l'app deve recuperare automaticamente anche i turni
autonomi ed esterni mancanti. Se il PC è spento, la cache non può ricevere
nuovi messaggi: il servizio always-on G12b è ancora una decisione da completare,
non una capacità offerta da questo APK.

Il client conserva separatamente la rotta preferita e la rotta attiva. Se la
LAN non supera il controllo `/health`, prova l'endpoint Tailscale già censito e
notifica il cambio di origine ai trasporti persistenti: SSE chiude la vecchia
connessione, richiede un nuovo token sulla nuova origine e si riconnette; le
richieste HTTP successive leggono la rotta attiva. Il ritorno alla LAN richiede
almeno un minuto sulla rotta di riserva e due prove di salute distanziate, così
una rete instabile non produce continui rimbalzi. Token scoped e URL vengono
sempre costruiti dalla stessa origine per evitare gare durante il cambio rete.

Questo failover può usare Tailscale soltanto quando la VPN Android è connessa.
Una WebView non può attivare silenziosamente una VPN di terze parti: sul telefono
Tailscale deve essere configurato come VPN sempre attiva se si vuole continuità
automatica al distacco dal Wi-Fi. L'installazione fisica e il passaggio reale
Wi-Fi → rete mobile restano una prova distinta dalla verifica del client.

Prove distinte:

- Build116: collaudo fisico storico di ritorno online senza Reconnect e cache
  dopo riapertura, descritto nel changelog del5/9.
- Build117: installata senza cancellare dati; il9/9 USB autorizzato e cache
  alle16:48 del5/9 corrispondente all'ultimo turno4980 della timeline canonica.
  Backend spento; non è una nuova prova online117.
- Le batterie storiche del changelog non sono state rieseguite da questo
  aggiornamento del manuale. Nessuna nuova build o installazione.

La prova USB usa il reverse8002 sul solo dispositivo autorizzato. Fuori casa
non esporre porte o attivare ADB wireless per tentativi indiscriminati: usare
il trasporto autenticato previsto dai runbook del backend.

## Push Android

Il plugin nativo è fail-closed: viene usato soltanto se build e backend
dichiarano Firebase configurato, evitando il crash di cold-start senza risorse.

Per una build push-enabled:

1. Fornire `android/app/google-services.json` del progetto senza pubblicare
   credenziali o configurazioni private nel repository.
2. Compilare con `VITE_KAEL_FIREBASE_PUSH_ENABLED=true`.
3. Configurare backend `KAEL_FIREBASE_PROJECT_ID` e
   `KAEL_FIREBASE_SERVICE_ACCOUNT_FILE`.
4. Verificare `/mobile/push/status` con `configured=true`, poi provare
   schermo bloccato, doze, task-kill, replay e deduplicazione.

Senza questi prerequisiti restano SSE/catch-up quando l'app può raggiungere
il server. Una notifica push non equivale al salvataggio del messaggio.

## Funzioni future, non pulsanti già operativi

La roadmap canonica comprende quadernetti testo/disegni, Dream nativo e sue
creazioni, foto etichettate con osservazione Moondream realmente consumata,
generazione ComfyUI ri-osservata, biblioteca esoterica/simbolica/storica e
browser isolato. Archivio chat >30giorni e lente di ricerca sono G12a.
Il piccolo avatar desktop Arrakis è separato dall'APK e dalla mascotte Codex;
la skin si decide insieme ad Alexien.

Prima si chiude la chat G01/G01E. Aggiungere UI soltanto quando il contratto
backend e la capacità effettiva sono disponibili; mostrare degrado/errore
reale invece di un successo senza effetto. Per immagini di persone reali
usare etichette/provenienza dichiarate, non identità indovinate dal volto.

## Sviluppo e verifiche

Versioni Node/npm supportate e comandi sono in [package.json](package.json);
`package-lock.json` è il lockfile canonico. Setup: `npm ci`, poi `npm run dev`.
Controlli disponibili: `npm run lint`, `npm test`, `npm run build`,
`npm run e2e:ui`, `npm run e2e:contract`. La corsia `e2e:live` richiede
il runbook isolato: non usarla contro la conversazione personale per comodità.

Build web, APK firmata, installazione fisica e collaudo end-to-end sono prove
separate. Dopo ogni implementazione importante aggiornare questo manuale,
[CHANGELOG](CHANGELOG.md), manuali/TREE backend pertinenti e PR26, quindi
commit/push. Non promettere una funzione perché esiste una pagina.

### Chiamate e nuovo AudioRuntime

La pagina chiamate usa il nuovo ingresso `/audio/notes` e presenta esclusivamente
il turno Arrakis committato tramite `/audio/speech/{assistant_turn_id}`. Non
mostra trascrizioni e non consuma `voice_audio`, TTS base64 o il vecchio
`/mobile/call/voice`. Il lifecycle usa esclusivamente `/audio/calls/*`; il
backend lega `call_id`, sessione e principal prima di accettare ogni turno.
Contratto, limiti e wiring ancora aperto sono descritti in
[Calls Native Audio Contract](docs/CALLS_NATIVE_AUDIO_CONTRACT.md).
