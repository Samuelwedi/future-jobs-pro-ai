import sounddevice as sd
import vosk
import json
import numpy as np

SAMPLE_RATE = 16000
CHUNK = 4000
model = vosk.Model("model")
recognizer = vosk.KaldiRecognizer(model, SAMPLE_RATE)

def callback(indata, frames, time, status):
    if recognizer.AcceptWaveform(indata.tobytes()):
        result = json.loads(recognizer.Result())
        text = result.get("text", "")
        if text:
            print(f"You said: {text}")

print("Speak into the microphone...")
with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='int16', callback=callback):
    input("Press Enter to stop...")