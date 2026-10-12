# Chat media and employee pay profile - 1.2.5

The web and Android/iOS source now support private conversation files (photos, short videos, audio, PDF, Word, Excel, PowerPoint, text and CSV; 25 MB per file). Group creators can change group photos. Existing profile photos appear in conversations. File bytes are stored as authenticated Cloudinary raw assets; only authorized active conversation members can download through the app. The app never exposes signed storage URLs.

The employee profile reads their own effective pay rate and upcoming rates from compensation_history, the same source payroll uses on each work date. Employees do not need manager access or see another employee's compensation. Same-date changes use creation order. Fixed raises use numeric addition. Draft and finalized payroll totals are not retroactively modified by profile reads.

Before server deployment run `node scripts/migrate-chat-media.cjs` in the backend working directory, using the selected service's environment. It applies only the additive chat schema and records its checksum. Existing Cloudinary credentials are required for avatars and attachments.

Verification: backend and web builds, mobile TypeScript, chat-media-profile and company-overtime tests (24 passing), including mid-period rate changes. Cloudinary upload options are checked with a provider stub; a real upload/download and physical-device picker/share tests remain release acceptance checks.

A signed Android/iOS build is required; source changes do not update installed 1.2.4 binaries. EAS uses remote build versions. The 1.2.5 app version is set; submit the signed build to the testing track after on-device verification. Test Android permission resume behavior, supported file formats, rejected oversize files, group creator permissions, user photos after restart, and posted versus future-effective employee rates.
