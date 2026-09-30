# Chiamate Arrakis: contratto client e bordo backend

## Stato del client

La schermata `Calls` non usa piu il turno legacy
`POST /mobile/call/voice`, non riceve `transcription`, `reply_text` o
`reply_audio_base64` e non mostra un transcript. Un turno vocale completato
attraversa questi confini reali:

1. acquisizione locale WebM/Ogg con AEC, noise suppression e auto gain;
2. endpointing locale bounded, senza classificare significato o emozione;
3. `POST /audio/notes` con lo stesso `session_id` della chat;
4. risposta Arrakis gia committata, identificata da `assistant_turn_id`;
5. `POST /audio/speech/{assistant_turn_id}` con lo stesso `call_id` validato e
   PCM framed nativo;
6. stop locale immediato, interrupt remoto e ricevute playout su
   `POST /audio/speech/{delivery_id}/playout`.

Il microfono e un prerequisito della chiamata; la camera e opzionale. Il client
prova prima audio+video e, se la camera non e disponibile, ripete la richiesta
solo audio. Non presenta piu una chiamata attiva senza una traccia microfono
reale. Le impostazioni AEC/NS/AGC lette dal `MediaStreamTrack` sono osservazioni
del browser/dispositivo, non conseguenze presunte dai constraint richiesti.
Il barge in acustico automatico e abilitato soltanto quando il track conferma
`echoCancellation=true`; altrimenti l'interfaccia dichiara il degrado e mantiene
l'interruzione locale esplicita tramite il pulsante microfono.

Il barge in non aspetta la rete per riaprire il microfono: il client silenzia il
gain, attende soltanto l'ack del Worklet e riparte con la cattura. Interrupt
remoto e consegna della ricevuta proseguono sullo stesso handle tracciato. La
ricevuta v3 conserva una causa bounded (`acoustic_barge_in`, `manual`,
`call_end`, `transport_failure`) e il valore AEC riportato; non conserva RMS,
device label, audio o identificativi hardware. Il backend accetta v2 e v3 nella
finestra di rollout.

La risposta PCM porta anche `X-Arrakis-Speech-Plan-SHA256`. Il client ne
verifica il formato prima di aprire il player, lo conserva nel binding
immutabile della delivery e lo restituisce come header di ogni ricevuta
playout. Il worklet audio riceve soltanto `utterance_id` ed `epoch`: il digest
identifica il piano di presentazione e non e un parametro DSP. Il backend
accetta la ricevuta soltanto se il digest coincide con quello persistito nella
delivery canonica.

Il testo riconosciuto resta un passaggio interno necessario al modello LLM
testuale corrente. Il client chiamata non lo visualizza e non crea una seconda
cronologia. Il player attesta campioni consumati dal motore Web Audio, non che
la persona li abbia uditi o compresi.

Ogni ricevuta usa `arrakis.playout-report.v2` e aggiunge misure monotone del
solo client: apertura player → primo frame decodificato, apertura → primo
quantum del Worklet, richiesta stop → comando locale di mute e richiesta stop
→ acknowledgement del Worklet. I clock client e server non vengono confrontati.
Il comando di mute prova l'azione locale richiesta, non il silenzio fisico della
soundcard; il primo quantum prova consumo Web Audio, non ascolto umano.

```mermaid
flowchart LR
  LIFE[/audio/calls lifecycle] --> BIND[call_id + session + principal]
  MIC[Microfono APK] --> EP[Endpointing locale]
  BIND --> NOTE[POST /audio/notes con call_id]
  EP --> NOTE
  NOTE --> COG[Cognizione e memoria canoniche Arrakis]
  COG --> TURN[assistant_turn_id committato]
  TURN --> SPEECH[POST /audio/speech/{turn_id} con call_id]
  SPEECH --> PCM[PCM framed]
  PCM --> PLAYER[AudioWorklet APK]
  PLAYER --> RECEIPT[Playout receipt canonica]
  STOP[Stop o barge in locale] --> PLAYER
  STOP --> INTERRUPT[Interrupt delivery remoto]
```

Questa implementazione e turn based con endpointing locale. Non e ancora una
prova di full duplex, WebRTC, VAD semantico, device Android reale o latenza live.

## Contratto lifecycle canonico

Il lifecycle e ora posseduto da
`kael_arrakis_agi_v3/140_runtime_interfaces/audio_runtime/call_routes.py`,
separato dai byte audio e dalla cognizione. Il client non genera call ID, non
finge una chiamata in ingresso e non sostituisce lo stato server con
`localStorage`.

| Operazione | Richiesta | Risposta minima |
|---|---|---|
| outgoing start | `POST /audio/calls/start?session_id=...` | `CallSession` attiva |
| active lookup | `GET /audio/calls/active?session_id=...` | `{call: CallSession|null}` |
| incoming check | `GET /audio/calls/incoming?session_id=...` | `{call: CallSession|null}` |
| incoming answer | `POST /audio/calls/{call_id}/answer?session_id=...` | `CallSession` attiva |
| incoming dismiss | `POST /audio/calls/{call_id}/dismiss?session_id=...` | `CallSession` dismissed |
| end | `POST /audio/calls/{call_id}/end?session_id=...` | `CallSession` ended |

Vincoli:

- il principal autenticato possiede l'identita; query/body non la assegnano;
- `call_id` e generato dal server e ha ownership first party verificata;
- incoming e prodotto da una decisione proattiva canonica di Arrakis, non da un
  timer cieco; il lifecycle riceve solo la decisione gia autorizzata. Il polling
  della pagina osserva quel record server e non costituisce il trigger cognitivo;
- start restituisce la chiamata attiva gia appartenente allo stesso principal;
  answer/dismiss/end applicano transizioni validate o falliscono con codice stabile;
- restart, timeout, dismiss, abort e perdita rete hanno stati terminali espliciti;
- lo stesso `session_id` della chat resta l'autorita di conversazione;
- `/audio/notes` e `/audio/speech` accettano il `call_id` soltanto quando la
  sessione e ancora attiva per quella conversazione e quel principal; il
  delivery journal conserva lo stesso ID e il client verifica l'header di bind;
- nessuna route lifecycle accetta testo, transcript, base64 audio, emotion label
  autoritativa o output TTS;
- nessun WebSocket testuale e un sostituto del futuro trasporto audio duplex.

## Wiring presente e prove ancora mancanti

- la shell globale osserva le chiamate in ingresso e apre la pagina Calls per
  accettazione o rifiuto;
- il barge in acustico arresta prima il player locale, interrompe il delivery
  remoto e riapre l'ascolto della stessa chiamata. Le fence di tentativo
  impediscono a una risposta vecchia di riprendere una chiamata nuova;
- restano mancanti streaming bidirezionale reale e una prova full duplex;
- prove su APK fisica, rete mobile, restart, chiamata proattiva e soak.

La route `/audio/notes` valida `call_id`, conversazione e principal prima di
accettare l'audio e incrementa il contatore del turno soltanto dopo il passaggio
nel coordinatore canonico. Se la chiamata termina durante la cognizione, il
record del turno o la successiva resa vocale falliscono chiusi invece di
continuare su una sessione terminata. La presenza del codice e dei test non
costituisce ancora una prova di chiamata live su APK.
