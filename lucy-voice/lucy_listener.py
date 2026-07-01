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

BACKEND_URL = os.getenv("LUCY_BACKEND_URL", "https://future-jobs-pro-ai-production.up.railway.app/api/lucy")
USER_ID = os.getenv("LUCY_USER_ID", "e0f62298-03f1-4908-bac2-8415e5a9d0e5")
SAMPLE_RATE = 16000
CHUNK = 4000
DEVICE_ID = 1

print("🗣️ Loading Vosk model...")
vosk_model = vosk.Model("model")
recognizer = vosk.KaldiRecognizer(vosk_model, SAMPLE_RATE)

print("🔊 Initializing Windows TTS...")
speaker = win32com.client.Dispatch("SAPI.SpVoice")
speaker.Rate = 0

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

def main():
    print("👂 Lucy is listening... (Say 'hey lucy', 'lucy' to wake)")
    sd.default.device = DEVICE_ID

    buffer_duration = 4
    buffer_samples = int(SAMPLE_RATE * buffer_duration)
    audio_buffer = np.array([], dtype='int16')
    wake_variations = ["hey lucy", "hi lucy", "hello lucy", "lucy",]

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='int16') as stream:
        while True:
            audio_chunk, _ = stream.read(CHUNK)
            audio_buffer = np.append(audio_buffer, audio_chunk)
            if len(audio_buffer) > buffer_samples:
                audio_buffer = audio_buffer[-buffer_samples:]

            if len(audio_buffer) >= buffer_samples:
                text = transcribe_audio(audio_buffer)
                if text and any(v in text.lower() for v in wake_variations):
                    print("🔔 Wake word detected!")
                    speak("Yes, I'm listening.")
                    # Reset the recognizer to clear the wake word from buffer
                    recognizer.Reset()
                    # Wait 0.5 seconds to let the user start speaking
                    time.sleep(0.5)
                    # Record the command for up to 8 seconds
                    command_audio = np.array([], dtype='int16')
                    start_time = time.time()
                    silent_chunks = 0
                    while True:
                        chunk, _ = stream.read(CHUNK)
                        command_audio = np.append(command_audio, chunk)
                        if len(command_audio) > SAMPLE_RATE * 1.5:
                            full_text = transcribe_audio(command_audio)
                            if full_text:
                                silent_chunks = 0
                            else:
                                silent_chunks += 1
                            if silent_chunks > 5:  # ~2.5s silence after command
                                break
                        if time.time() - start_time > 8:
                            break
                    command_text = transcribe_audio(command_audio)
                    if command_text:
                        for w in wake_variations:
                            command_text = command_text.lower().replace(w, '').strip()
                        print(f"📝 Command: {command_text}")
                        response_text, approval_id = send_to_backend(command_text)
                        speak(response_text)
                        if approval_id:
                            speak("Please check your phone to approve or reject.")
                    else:
                        print("⚠️ No command detected.")
                    recognizer.Reset()
                    audio_buffer = np.array([], dtype='int16')

if __name__ == "__main__":
    main()