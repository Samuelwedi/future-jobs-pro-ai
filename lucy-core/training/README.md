# Training the owned Lucy model

The production phrase should be **Lucy**, with **Hey Lucy** included as a
positive variation. Do not use “Jarvis” as the public brand; build Jarvis-like
capability under the trademark you own.

1. Record at least 100 real positive clips across different speakers, phones,
   distances, accents, rooms, and job-site noise.
2. Generate several thousand commercially-cleared synthetic positive clips.
3. Collect licensed negative speech/noise/music representative of actual work.
4. Train using the openWakeWord training notebook/code and export ONNX.
5. Evaluate false accepts over at least 24 hours of negative audio.
6. Evaluate missed detections across people who were not in training.
7. Put the accepted classifier at `models/lucy.onnx`.

Recommended release gates:

- False accepts: below 0.5 per hour in representative background audio.
- False rejects: below 5% across the supported speaker population.
- No training clip may lack a recorded source and commercial-use license.

The included manifest template makes the data provenance auditable.
