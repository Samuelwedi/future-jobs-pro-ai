# Future Jobs Pro AI installation

This overlay includes the restored professional Home/Demo screens, the voice
`company_id` repair, Assistant-only transcription, and Lucy wake clients.

## Files

Copy `future-jobs-update/backend`, `mobile`, and `web` over the matching project
folders. Do not copy package files; install the dependencies explicitly.

Mobile:

```powershell
Set-Location .\mobile
npm uninstall @picovoice/porcupine-react-native
npm install expo-modules-core
npm install .\modules\lucy-wake-audio
```

Web:

```powershell
Set-Location .\web
npm install
```

Variables:

```text
VITE_LUCY_WAKE_URL=wss://YOUR-LUCY-WAKE-SERVICE/v1/listen
EXPO_PUBLIC_LUCY_WAKE_URL=wss://YOUR-LUCY-WAKE-SERVICE/v1/listen
```

The wake service and the main backend must use the same `JWT_SECRET`; set it on
the wake service as `LUCY_WAKE_JWT_SECRET`.

The mobile module is native code and requires a new EAS build. It cannot be
added through an over-the-air JavaScript update.

## Verification

```powershell
npm run build --prefix backend
npm run build --prefix web
npx tsc --noEmit --project .\mobile\tsconfig.json
```

Test wake detection on a physical device. Simulators and desktop browser tests
do not accurately represent microphone routing, echo, or job-site noise.
