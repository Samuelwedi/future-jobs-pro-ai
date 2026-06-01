import asyncio
import websockets
from openwakeword.model import Model
import json

# Load the pre-trained "hey_lucy" model (will download on first run)
model = Model(wakeword_models=["alexa"], inference_framework="onnx")
# Note: "hey_lucy" is not a built-in model, so we'll use "alexa" as a demo.
# You can train a custom "hey_lucy" model later with openWakeWord's training script.
# For now, saying "Alexa" will trigger the wake word.

async def handle(websocket):
    print("Client connected")
    async for message in websocket:
        # message is raw audio bytes (16-bit PCM, 16kHz mono)
        prediction = model.predict(message)
        # Check if wake word probability exceeds threshold
        if prediction["alexa"] > 0.7:
            await websocket.send(json.dumps({"event": "wake-word-detected"}))
            print("Wake word detected!")

async def main():
    async with websockets.serve(handle, "0.0.0.0", 8765):
        print("Wake word service running on port 8765")
        await asyncio.Future()  # run forever

asyncio.run(main())