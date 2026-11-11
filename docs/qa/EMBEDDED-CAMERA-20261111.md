# Embedded camera implementation

The mobile evidence screen now uses Expo Camera 55's embedded preview rather than opening the system camera application. Existing scoped evidence receipts, metadata, upload recovery, and attachment handling are retained.

## Capture behavior
- Still photos request the largest advertised pixel size on Android and the full-photo capture preset on iOS, with JPEG quality 1 and orientation processing enabled.
- Video requests 2160p. Expo documents native fallback to the highest available quality when unsupported; this is a request, not verified 4K output on every device.
- Video has an in-app Stop button, a 30-minute maximum, and a 950 MiB recording limit below the evidence endpoint's 1 GiB limit. Whichever limit is reached first ends recording.
- Video preview waits for the local Lucy wake microphone to stop. Native stop failures block the handoff and retain the native handle for retry; delayed or concurrent wake starts cannot replace the tracked detector. Scoped microphone leases prevent stale cleanup from releasing a newer camera session.
- Preview unmounts on blur/background. Interrupted capture callbacks and permission dialogs cannot submit new media or update another account/project/shift session. Already-started network uploads are not cancelled; existing durable recovery checks their receipts later.
- Denied camera permission can be requested again using capture; failed preview initialization offers Retry. The OS may require Settings after permanent denial.

## Validation
- Full mobile Node regression suite: 322 tests passed.
- Mobile TypeScript: `tsc --noEmit -p mobile/tsconfig.json` passed.
- `git diff --check` passed.
- Regression coverage includes size selection, full-quality photo options, video stop/limits/container preservation, duplicate taps, same-mode taps, permissions, stale scopes/background results, microphone lease overlap, and wake startup/stop ordering.

## Required device QA before release
No physical camera, native build, provider call, deployment, or external upload was performed. Actual camera dimensions/codec/bitrate and visual quality remain unverified on devices. Test iPhone and Android photos plus short/long video; verify audio, orientation, unsupported-4K fallback, permission denial/re-enable, repeating capture, mode changes, app background/navigation interruption, Lucy wake resume, upload retry/offline recovery, and account/project/shift changes. Confirm native permission copy in a new authorized binary. Camera preview sizing and controls need on-device visual review.

Reference: https://docs.expo.dev/versions/v55.0.0/sdk/camera/
