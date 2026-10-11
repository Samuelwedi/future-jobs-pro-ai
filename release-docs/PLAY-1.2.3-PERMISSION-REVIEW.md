# Mobile 1.2.3 permission review

This update adds a prominent disclosure before requesting background location, cancels pending tracking starts on clock-out/logout, rejects legacy sessions without recorded disclosure, and disables unused Expo Audio background playback/recording services. App version is 1.2.3; EAS remote auto-increment remains responsible for Android versionCode and iOS buildNumber.

## Verified locally

- Complete mobile TypeScript check passed.
- Eight background-location consent/session tests passed.
- Expo native configuration introspection retains ACCESS_BACKGROUND_LOCATION and FOREGROUND_SERVICE_LOCATION and removes FOREGROUND_SERVICE_MEDIA_PLAYBACK and AudioControlsService.
- These checks do not replace inspecting the final Android bundle or testing on devices.

## Draft Google Play declarations

App purpose:
Future Jobs Pro AI helps companies manage employees, projects, work shifts, timesheets and payroll records. Employees clock in to assigned work and companies can review crew locations and routes for active shifts.

Background location feature:
During an active clocked-in shift, employees can consent to work-route recording and location sharing with their company even when the app is closed or not in use. The app presents a disclosure before requesting permission. Clocking out or signing out stops this tracking. Employees can decline background tracking and continue using the app.

Foreground service category: Location, user-initiated location sharing during a work shift. Confirm the final bundle no longer requests the media-playback foreground service before updating its declaration.

## Required before submission

1. Run full release validation with this source, then build Android 1.2.3 and iOS 1.2.3 with new remote build numbers. Do not reuse Android 1.2.2 (4).
2. Install the new Android build on a real device. Test both decline and accept, OS permission denial, clock-out and logout, and confirm the tracking notification disappears when stopped. Test media playback/recording in the foreground on both platforms.
3. Record the actual Android flow using a test company: clock in, show the complete disclosure, Continue, OS location permissions, active-shift tracking notification and background behavior, then clock out. Use only test data and avoid exposing credentials or personal routes. Upload the recording as an accessible unlisted video and use its real URL in Play Console. A mockup is not review evidence.
4. Replace the community-testers draft bundle with the new build, complete truthful location/foreground-service declarations and any remaining Console requirements, then submit the closed-test release. Tester group eligibility alone does not publish the release.

The Google Group is futurejobsproai-testers@googlegroups.com. Testers must join with their Play account and separately opt in through the Play testing link after the track is available.

References: https://support.google.com/googleplay/android-developer/answer/9799150 and https://docs.expo.dev/versions/v55.0.0/sdk/audio/
