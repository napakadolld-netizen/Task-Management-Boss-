# Dayflow ↔ Google Calendar setup

## Prepared behavior
- A separate Google calendar named **Dayflow**. Only `calendar.app.created`, `openid`, and `email` scopes are requested. The main Google calendar is not read or modified.
- Sign in to Dayflow first; then connect a Google account. OAuth uses one-time, expiring state, a browser cookie and PKCE. Refresh tokens are encrypted on the server with AES-256-GCM, never browser storage.
- First synchronization creates the dedicated calendar. Only Dayflow appointments explicitly opted into sync are exported. Existing Tasks remain independent.
- Changes in the dedicated Google calendar are imported. New Google appointments use **งานทั่วไป / ประสานงาน** until assigned another category in Dayflow. IDs and last synchronized hashes prevent duplicate creation. ETags guard Google updates; compare-and-swap guards local imports.
- Conflicting edits are held for a choice. Google-side deletion asks for confirmation before deleting in Dayflow. Dayflow-side deletion of an enabled appointment asks for confirmation before it can propagate.
- Auto-sync runs roughly every 60 seconds while the authenticated, visible web page is open, and after saved opted-in appointments. There is a manual Sync now action.
- Browser-closed synchronization is **not enabled by default**. An optional scheduler can call the authenticated cron endpoint below.
- All-day, timed and multi-day ordinary appointments are supported; Bangkok is the display timezone. Attendee text is stored as metadata; this integration does not send invitations or modify Google's guest list.
- Recurring series, recurrence exceptions and Google's special event types are deliberately left in Google and produce a sync warning. They are not imported or flattened into incorrect single appointments in this initial version.

## 1. Google Cloud setup
1. Open https://console.cloud.google.com/ and create a project such as `Dayflow Calendar`.
2. In APIs & Services → Library, find **Google Calendar API** and enable it.
3. In Google Auth Platform configure Branding: app name Dayflow, your support email and developer contact email.
4. Configure Audience. For personal testing choose External/Testing and add the Google email that will connect as a test user. Internal is available only when your Workspace organization supports it.
5. Data Access: add `openid`, `email`, and `https://www.googleapis.com/auth/calendar.app.created`.
6. Clients → Create client → Web application.
7. Register the **exact** Authorized redirect URI:
   `https://task-management-boss.vercel.app/api/google-calendar/callback`
8. Save the Client ID and Client Secret directly in Vercel settings. Do not send the secret in chat or commit it.
9. Google may require app verification before wider/public use. Testing-mode grants may expire; reconnect as required by Google. Follow Google's consent/verification instructions for your chosen audience.

## 2. Vercel configuration
Open your `task-management-boss-` Vercel project → Settings → Environment Variables.

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Web OAuth Client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret; server only |
| `GOOGLE_REDIRECT_URI` | `https://task-management-boss.vercel.app/api/google-calendar/callback` |
| `DAYFLOW_TOKEN_ENCRYPTION_KEY` | 32 random bytes encoded in base64; server only |
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Existing publishable key |
| `SUPABASE_SECRET_KEY` | Existing server secret/service-role key; server only |

Generate an encryption key locally with `openssl rand -base64 32`, then paste it into Vercel's secret setting. Keep it stable; changing it makes existing tokens unreadable and requires reconnecting. No secret values belong in repository files.

Configure these for the intended environment. Do not point unreviewed Preview code at production secrets. For OAuth testing on Preview use a separate test Supabase project and Google OAuth client, with an exact, stable Preview callback URL; `GOOGLE_REDIRECT_URI` also controls the accepted website origin. Local plain HTTP preview shows the setup screen only, because the secure callback cookie requires HTTPS.

## 3. Supabase migration
Before activating the integration, run `supabase-google-calendar-migration.sql` once in Supabase SQL Editor. It creates three integration tables plus lock and compare-and-swap RPC functions. Existing task/appointment rows are not modified.

The tables have RLS enabled and no browser grants/policies; only the server service-role client may access tokens, OAuth states and link records. The server validates the existing Dayflow JWT on every user operation.

## 4. Preview and live acceptance
1. Deploy the reviewed branch to an HTTPS Preview with its test environment configured.
2. Sign in to Dayflow. Open **Google Calendar**, connect your Google test account and approve the narrow calendar permission.
3. Click **ซิงก์ตอนนี้**. A separate Dayflow calendar is created.
4. Create a test appointment, choose a category, tick the Google sync checkbox and confirm. Verify exactly one Google event appears.
5. Edit the event in Google → Sync now → verify the same Dayflow appointment updates, with its category intact.
6. Edit from Dayflow and verify the same Google event ID updates.
7. Test all-day and multi-day boundaries, conflict resolution, confirmed deletion, reauthorization and a second device.
8. Approve production deployment only after these live tests pass. Do not import the backup JSON into production just to test integration.

Without the Google Cloud credentials, migration and user consent, live OAuth and Google API acceptance cannot be verified. The automated suite uses mocks and does not access a real account/database.

## 5. Optional background scheduler
No cron schedule is shipped/enabled automatically. If your hosting plan supports the desired frequency:
- Create a random server-only `CRON_SECRET` in Vercel.
- Have your trusted scheduler send `GET https://task-management-boss.vercel.app/api/google-calendar?action=cron` with `Authorization: Bearer <CRON_SECRET>`.
- Each run processes one connected account, oldest attempted first. For this personal workspace use a schedule appropriate to Vercel's limits. Browser polling/manual sync remains usable without a scheduler.
- A scheduler failure never advances the failed sync checkpoint. Observe retries and connection status.

## Implementation and tests
`npm run test:calendar` runs mocked two-way and OAuth checks. Syntax-check `app.js`, `google-calendar.js`, `api/google-calendar.js`, `api/google-calendar/callback.js`, and `lib/google-calendar-*.js` before releasing. Backend requests have timeouts; large calendars may need another sync attempt, and rate-limit failures leave the checkpoint intact.

The category calendar/activity feature in PR #18 is the base of this integration branch and is still pending production approval.

## Official references
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/guides/sync
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
