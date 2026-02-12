# OAuth Sign-In User Manual

## What this adds

The sign-in page supports Google OAuth in addition to email/password auth.

## How to use it

1. Open `/signin`.
2. Click `Continue with Google`.
3. In production, the browser redirects to Google's consent screen. In local dev, the mock OAuth scaffold completes automatically.
4. On success, your session is stored and all signed-in pages auto-load your user data.

## Production setup

To enable real Google OAuth:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Identity** API.
3. Under **Credentials**, create an **OAuth 2.0 Client ID** (Web application).
4. Add `http://localhost:4005/internal/auth/oauth/google/callback` (dev) and your production callback URL as authorized redirect URIs.
5. Set environment variables:
   ```
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```
6. When both env vars are set, the identity service uses the real Google flow. When unset, it falls back to the mock scaffold for local development.

## Notes

- Provider support: `google` (OpenID Connect with PKCE).
- Scopes requested: `openid email profile`.
- Session handling stays the same as email/password (`script_manifest_session` in local storage).
- The gateway and frontend proxy routes are provider-agnostic (`:provider` / `[provider]`), so no gateway changes are needed to switch providers.
