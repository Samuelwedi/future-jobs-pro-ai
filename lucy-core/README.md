# Lucy Core

Lucy Core is a self-hosted wake-word gateway for **“Hey Lucy”** and **“Lucy”**.
It uses local ONNX inference through openWakeWord. There are no access keys,
registrations, analytics calls, or vendor cloud services.

## Important licensing rule

Do not ship openWakeWord's bundled `hey_jarvis` model in a commercial app. The
engine code is Apache-2.0, but bundled models are CC BY-NC-SA. Train and ship a
Lucy classifier from audio you own or have licensed for commercial use.

Place the trained classifier at `models/lucy.onnx`. The service refuses to
start without it, preventing an accidental fake detector.

## Run

```bash
docker compose up --build
```

Health: `http://localhost:8787/health`
WebSocket: `ws://localhost:8787/v1/listen`

Set `LUCY_WAKE_JWT_SECRET` in production. Clients then connect with
`?token=<your normal application JWT>`.

## Protocol

Client JSON:

```json
{"type":"audio","pcm16Base64":"...","sampleRate":16000}
```

Server JSON:

```json
{"type":"wake","phrase":"lucy","score":0.84,"at":1787020972949}
```

Audio is 16 kHz, mono, signed PCM16 little-endian. It is processed in memory
and is never written to disk.

## Platform reality

- Web: works while the page is open and microphone permission remains active.
- iOS: foreground listening is supported. Apple does not allow an ordinary
  third-party app to behave exactly like Siri while terminated.
- Android: foreground listening is supported. Continuous background capture
  needs a visible foreground service and separate privacy/store review.

This is the wake layer, not the LLM. A wake event opens Lucy, which then uses
the existing authenticated `/api/lucy` memory and tool-calling workflow.
