import os
import time
from pathlib import Path

import numpy as np
from openwakeword.model import Model


class LucyWakeEngine:
    def __init__(self) -> None:
        model_path = Path(os.environ.get("LUCY_WAKE_MODEL", "models/lucy.onnx"))
        if not model_path.is_file():
            raise RuntimeError(f"Lucy wake model is missing: {model_path}")
        self.threshold = float(os.environ.get("LUCY_WAKE_THRESHOLD", "0.58"))
        self.cooldown_ms = int(os.environ.get("LUCY_WAKE_COOLDOWN_MS", "2500"))
        self.model = Model(wakeword_models=[str(model_path)], inference_framework="onnx")
        self.last_detection_ms = 0

    def reset(self) -> None:
        self.model.reset()
        self.last_detection_ms = 0

    def process(self, pcm_bytes: bytes) -> dict | None:
        if len(pcm_bytes) % 2:
            raise ValueError("PCM16 payload must contain an even number of bytes")
        audio = np.frombuffer(pcm_bytes, dtype="<i2")
        if audio.size == 0:
            return None
        predictions = self.model.predict(audio)
        score = max((float(value) for value in predictions.values()), default=0.0)
        now = int(time.time() * 1000)
        if score < self.threshold or now - self.last_detection_ms < self.cooldown_ms:
            return None
        self.last_detection_ms = now
        return {"type": "wake", "phrase": "lucy", "score": score, "at": now}
