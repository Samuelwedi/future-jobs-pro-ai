# Work-screen localization — 2026-10-31

Five native work screens now use the existing saved language context: Projects, Schedule, Timesheet, Tasks and Create/Edit Shift. Static display labels, placeholders, back accessibility labels, local validation and alert text support Spanish and French. Calendar weekdays/months and task lane/count labels follow the selected language. Unknown server error text and user-entered records are not silently rewritten.

User/project/client names, notes, task descriptions, attachment filenames, addresses, route IDs, API field names and status enum values stay unchanged. Whole-message parameters handle archive names, employee counts and filenames. Translation interpolation replaces repeated placeholders in one pass, preventing user-supplied placeholder text from being recursively substituted.

Date-only schedule labels format in UTC from their original calendar key, so a phone timezone cannot shift the selected day. Selection/query dates remain ISO date-only values. Timesheet clock labels use the returned company timezone, while duration calculations and payroll values are untouched. Create/Edit Shift now labels the existing edit save as Save shift instead of Create Shift.

Validation: all 40 mobile tests pass, including the existing patched braces/node-forge security cases. Native TypeScript passes against the installed Expo SDK 55 dependency tree. New AST checks cover every static JSX/placeholder/alert entry in the five screens and validate Spanish/French parameter sets. Tests also cover calendar validity, distinct company timezone displays, repeated/nonrecursive interpolation and unchanged routes/payload fields.

Seven real React/LanguageContext browser checks pass using explicit native-to-DOM test adapters and synthetic local HTTP records: English/Spanish/French switching, persisted language after reload, project edit payload and unchanged names, schedule navigation, timesheet labels, task enum writes and shift ISO-date/employee-ID writes. The adapter harness is not a React Native device, camera or store test. It supplies no device acceptance evidence.

To reproduce the harness, install an isolated QA runtime with vite 6, playwright, @sparticuz/chromium, react 19 and react-dom 19, then set FJ_QA_NODE_MODULES to its node_modules and run `node scripts/check-work-localization-browser.mjs` from the repository root. BROWSER_PATH can select an already available Chromium binary. The script cleans up its disposable fixtures and does not contact the live API or use real account credentials.

The approved PR #5 release, iOS 1.2.8 build 56 and Android version code 10 predate this follow-up. No new paid build was started. Android publication remains held. Full localization of remaining mobile screens, customer web and portal, translated physical-device acceptance, provider integrations and the other retained parity work remain open.

Compatibility follow-up: this branch includes the existing PR #6 mobile expenses source and dictionary entries, with both parents retained in Git history. All 40 combined mobile tests and TypeScript passed. Merge the prepared source coherently in the next reviewed native release; do not drop either feature set.
