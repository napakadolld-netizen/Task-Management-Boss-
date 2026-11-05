# Public welcome and owner Google access

Prepared for review; do not deploy or run the permissions migration until approved.

Visitors see the welcome screen first, then enter the same workspace in read-only mode. The public API is explicitly opt-in with `DAYFLOW_PUBLIC_WORKSPACE=enabled`; it returns task/appointment fields for one fixed workspace, never Google tokens, service keys, or authentication metadata. Everyone with the URL can read the shared details after publication. The welcome button is navigation, not a password or private sharing boundary.

The owner signs in through Supabase Google OAuth. The server validates the bearer token with Supabase, requires a verified Google identity and an OAuth-authenticated session (AMR) and the configured owner email, normalizes only Gmail dots/domain aliases, and maps to the existing workspace UUID so Google login does not create an empty workspace. Google Calendar authorization continues to use the existing canonical owner UUID and encrypted connection.

## Required setup before activation

1. Enable Google in Supabase Authentication → Sign In / Providers. Use a Web OAuth client with the exact callback `https://ixdlxkbyimpfbupgibdv.supabase.co/auth/v1/callback`. This is additional to the existing Calendar callback; do not remove that callback or replace its credentials.
2. Set Supabase Site URL to `https://task-management-boss.vercel.app` and allow the matching owner redirect `https://task-management-boss.vercel.app/?owner=1` under Authentication URL Configuration. For a separate live test environment use that environment's own exact URL and test database/credentials.
3. Set server environment variables `DAYFLOW_SITE_ORIGIN=https://task-management-boss.vercel.app`, `DAYFLOW_WORKSPACE_OWNER_ID=2abeb576-cbb2-4cb6-8c52-8c36a8ea18e0`, and `DAYFLOW_OWNER_EMAIL=napakadol.ld@gmail.com`. Keep the existing Supabase server credentials and Google Calendar settings. Do not put client secrets in chat or source.
4. After owner sign-in and the server write endpoint are verified, apply `supabase-owner-only-migration.sql`. It revokes browser insert/update/delete permissions while keeping RLS enabled. Authenticated owner writes go through the server, which rejects anonymous users, other Google accounts, cross-origin writes and foreign workspace IDs. Existing server integrations keep using service-role access.
5. When approved to make the workspace readable to people with its URL, set `DAYFLOW_PUBLIC_WORKSPACE=enabled` and deploy. Before that flag is set, anonymous data reads fail closed.

The browser hides editing controls and shows read-only details. Backend authorization and database privileges enforce persistence rules even if browser controls are bypassed. Do not claim the migration or live Google login is verified before running it in the intended environment.

## Local visual preview

Run `npm run preview:welcome`, then open `http://127.0.0.1:4174/`. This preview uses only synthetic tasks, To-dos and an appointment. The Google button reports that no real account is connected; it never redirects to real consent or uses production secrets.

Official reference: https://supabase.com/docs/guides/auth/social-sign-in/auth-google
