#!/usr/bin/env python3
import sounddevice as sd
import numpy as np
import vosk
import json
import requests
import time
import os
import sys
import win32com.client

# ===== CONFIGURATION =====
BACKEND_URL = os.getenv("LUCY_BACKEND_URL", "http://localhost:5000/api/lucy")
USER_ID = os.getenv("LUCY_USER_ID", "e0f62298-03f1-4908-bac2-8415e5a9d0e5")
SAMPLE_RATE = 16000
CHUNK = 4000
WAKE_WORD = "hey lucy"

# ===== LOAD VOSK MODEL =====
print("🗣️ Loading Vosk model...")
# Make sure you have a folder named "model" with the Vosk files
vosk_model = vosk.Model("model")
recognizer = vosk.KaldiRecognizer(vosk_model, SAMPLE_RATE)
recognizer.SetWords(True)

# ===== LOAD WINDOWS TTS =====
print("🔊 Initializing Windows TTS...")
speaker = win32com.client.Dispatch("SAPI.SpVoice")

def speak(text):
    print(f"🗣️ Lucy: {text}")
    speaker.Speak(text)

def send_to_backend(text):
    try:
        response = requests.post(BACKEND_URL, json={"message": text, "userId": USER_ID}, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return data.get("text", "I didn't understand that."), data.get("approvalId")
        else:
            return "Sorry, I'm having trouble connecting.", None
    except Exception as e:
        return f"Error: {str(e)}", None

def transcribe_audio(audio_data):
    if recognizer.AcceptWaveform(audio_data.tobytes()):
        result = json.loads(recognizer.Result())
        return result.get("text", "")
    return ""

def record_command_until_silence(stream):
    print("🎤 Recording command...")
    audio_buffer = []
    silent_chunks = 0
    start_time = time.time()
    while True:
        audio_chunk, _ = stream.read(CHUNK)
        audio_buffer.append(audio_chunk)
        if len(audio_buffer) > 10:
            full_audio = np.concatenate(audio_buffer)
            text = transcribe_audio(full_audio)
            if text:
                silent_chunks = 0
            else:
                silent_chunks += 1
            if silent_chunks > 6:  # ~1.5s silence
                break
        if time.time() - start_time > 10:
            break
    full_audio = np.concatenate(audio_buffer)
    return transcribe_audio(full_audio)

def main():
    print("👂 Lucy is listening... (Speak 'hey lucy' to wake)")
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='int16') as stream:
        continuous_buffer = np.array([], dtype='int16')
        while True:
            audio_chunk, _ = stream.read(CHUNK)
            continuous_buffer = np.append(continuous_buffer, audio_chunk)
            if len(continuous_buffer) > 8 * SAMPLE_RATE:
                continuous_buffer = continuous_buffer[-8 * SAMPLE_RATE:]
            text = transcribe_audio(continuous_buffer)
            if text and WAKE_WORD in text.lower():
                print("🔔 Wake word detected!")
                command_text = record_command_until_silence(stream)
                if command_text:
                    command_text = command_text.lower().replace(WAKE_WORD, '').strip()
                    print(f"📝 Command: {command_text}")
                    response_text, approval_id = send_to_backend(command_text)
                    speak(response_text)
                    if approval_id:
                        speak("Please check your phone to approve or reject.")
                else:
                    print("⚠️ No command detected.")
                continuous_buffer = np.array([], dtype='int16')
                recognizer.Reset()

if __name__ == "__main__":
    main()