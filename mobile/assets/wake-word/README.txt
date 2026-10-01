Required custom Picovoice keyword files
========================================

Download four custom keyword models from the Picovoice Console and place
them here with these exact names:

  hey_lucy_ios.ppn      (phrase: "Hey Lucy", platform: iOS)
  lucy_ios.ppn
  hey_lucy_android.ppn  (phrase: "Hey Lucy", platform: Android)
  lucy_android.ppn

The two lucy_* models use the phrase "Lucy" for their matching platform.

Generate each model for its matching platform. Do not rename an Android
model to look like an iOS model or vice versa.

The build plugin deliberately stops the native build if either required
model is missing. This prevents shipping a fake or simulated wake word.
