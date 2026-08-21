import base64
import json
import os
from pathlib import Path

import jwt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .engine import LucyWakeEngine

app = FastAPI(title="Lucy Wake", version="1.0.0")


def authorized(token: str | None) -> bool:
    secret = os.environ.get("LUCY_WAKE_JWT_SECRET", "").strip()
    if not secret:
        return os.environ.get("LUCY_WAKE_ALLOW_UNAUTHENTICATED", "false").lower() == "true"
    if not token:
        return False
    try:
        jwt.decode(token, secret, algorithms=["HS256"])
        return True
    except jwt.PyJWTError:
        return False


@app.get("/health")
async def health() -> dict:
    model = Path(os.environ.get("LUCY_WAKE_MODEL", "models/lucy.onnx"))
    return {"status": "ok" if model.is_file() else "model_missing", "engine": "local-openwakeword", "storesAudio": False}


@app.websocket("/v1/listen")
async def listen(socket: WebSocket) -> None:
    if not authorized(socket.query_params.get("token")):
        await socket.close(code=4401, reason="Unauthorized")
        return
    await socket.accept()
    engine = LucyWakeEngine()
    engine.reset()
    try:
        while True:
            message = json.loads(await socket.receive_text())
            if message.get("type") != "audio" or message.get("sampleRate") != 16000:
                await socket.send_json({"type": "error", "message": "Expected 16 kHz PCM16 audio"})
                continue
            pcm = base64.b64decode(message.get("pcm16Base64", ""), validate=True)
            detection = engine.process(pcm)
            if detection:
                await socket.send_json(detection)
    except (WebSocketDisconnect, json.JSONDecodeError, ValueError):
        return
