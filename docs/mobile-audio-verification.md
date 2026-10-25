# Mobile audio lifecycle repair (1.2.7)

Lucy and voice notes now own a recorder only for a recording session. The
session cancels synchronously on navigation or unmount, waits for pending
native prepare/stop calls before release, and reads the completed file URI
before releasing the native object. UI state checks use JavaScript state;
rendering does not access a native recorder getter. Metering failures retire
the session and display a recoverable microphone interruption.

Media playback clears player ownership and listeners before disposal. Pending
video loading cannot call play after the screen or selection has changed.

## Automated verification

From `mobile`:

```sh
npx tsc --noEmit
node --test tests/*.test.cjs
npx expo export --platform all
```

The recorder regression tests exercise normal stop, unmount during prepare,
navigation during stop, repeated taps, native prepare failure, native status
failure, focus while cancellation is pending, and delayed callbacks after
unmount. These tests use a native-object double that rejects access after
release. They do not replace device testing.

## Release acceptance

Install the new 1.2.7 binary on Android and iOS. A backend redeploy does not
update an installed mobile binary.

1. Open Lucy, start speaking, and stop. Confirm transcription and response.
2. Start recording and immediately navigate back; reopen and record again.
3. Repeat while the microphone permission prompt or preparation is pending.
4. Background and foreground the app during recording; verify microphone
   capture ends and a new recording can start after returning.
5. Tap start/stop rapidly; verify no duplicate upload and no error boundary.
6. Record a project voice note; verify upload, transcription, and playback.
7. Close media playback while it is loading; reopen and play another item.
8. Check incident telemetry for new released-object errors from the new build.

Keep incidents open until the new binary is distributed and the device checks
pass. Absence of new events while no one is testing is not proof of resolution.

The manual `submit-ios-build.yml` workflow uploads a chosen completed iOS
production build using the existing submission profile. It has no automatic
push trigger and does not submit an App Store listing for public review.
