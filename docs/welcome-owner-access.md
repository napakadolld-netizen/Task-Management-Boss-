# Welcome, public viewing and owner Google login

Visitors see the welcome page before entering the read-only workspace. The approved deployment shares the existing canonical workspace by default. Set DAYFLOW_PUBLIC_WORKSPACE=disabled to turn anonymous reads off. The welcome button is navigation, not a private sharing boundary; anyone with the URL can view task and appointment details.

## Owner authentication

Owner sign-in reuses the existing Google Web OAuth client, server-side secret and registered Calendar callback. There is no additional Supabase provider or credential setup.

POST /api/owner-auth starts a separate Google OAuth flow requesting only openid/email, with random browser-bound state, a PKCE verifier encrypted in the existing private OAuth-state table, and a purpose marker. The registered /api/google-calendar/callback dispatches the owner flow only when its separate HttpOnly state cookie matches. Owner state is single use. Callback completion checks the verified Google email against DAYFLOW_OWNER_EMAIL (normalizing Gmail dot aliases only), then creates an encrypted, Secure, HttpOnly, SameSite=Lax owner session for eight hours. Google tokens from this login are discarded after reading identity. Calendar refresh tokens and links are unchanged.

The browser never receives the owner session contents. Mutating workspace endpoints validate the session, force the canonical workspace ID and reject foreign records and cross-origin writes. Existing authenticated Google/Supabase owner tokens remain supported for compatibility; non-owner identities are rejected. Google Calendar and server integrations use the same canonical owner UUID.

## Existing environment

The existing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, DAYFLOW_TOKEN_ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY and DAYFLOW_OWNER_EMAIL remain required. DAYFLOW_WORKSPACE_OWNER_ID optionally overrides the existing canonical UUID. DAYFLOW_SITE_ORIGIN optionally overrides the origin of the registered callback. No new production values are required for the current deployment.

Existing Supabase RLS continues to deny visitors writes to the owner's rows. The optional supabase-owner-only-migration.sql additionally revokes direct browser write grants so even the owner's legacy browser tokens must use the server endpoint. Apply it only after owner access is confirmed; do not disable RLS. The service-role server integrations retain their existing grants. Do not claim this optional migration has been applied until verified.

## Verification

Run npm test. Coverage includes owner OAuth state/PKCE, purpose isolation, verified-email restriction, canonical workspace mapping, single-use callbacks, expired/forged session rejection, sign-out, visitor write rejection, public read scope and existing Calendar regressions. Live owner login requires the owner's Google session; do not claim that live acceptance passed solely because mocked tests pass.

npm run preview:welcome serves synthetic data at http://127.0.0.1:4174 without production credentials.
