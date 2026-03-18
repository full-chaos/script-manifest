# Setup Guide

This is the quickest path to get Script Manifest running locally and to enable Google sign-in in a real environment.

## What you need

- Node.js and `pnpm`
- Docker with Compose support
- A `.env` file based on [`.env.example`](../.env.example)
- Optional: a Google Cloud project if you want real Google OAuth instead of the local mock flow

## Local Quick Start

1. Copy the env template and fill in the required secrets:

   ```bash
   cp .env.example .env
   ```

2. Set the required auth and storage values before starting the stack:

   - `MFA_ENCRYPTION_KEY`
   - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` if you are testing payment flows
   - `LINEAR_API_KEY` if you want the bug-report widget to create issues

3. Install dependencies and verify the workspace:

   ```bash
   pnpm install
   pnpm test
   pnpm typecheck
   ```

4. Start the local infrastructure:

   ```bash
   docker compose -f compose.yml up -d
   ```

5. Start the services you want to work on, for example:

   ```bash
   pnpm --filter @script-manifest/identity-service dev
   pnpm --filter @script-manifest/api-gateway dev
   pnpm --filter @script-manifest/writer-web dev
   ```

## Google OAuth Setup

The identity service supports Google OAuth when both of these env vars are set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` optionally pins the browser return URL if the frontend does not send one explicitly

When they are blank, the sign-in flow falls back to the mock OAuth scaffold used for local development.

### 1. Create the OAuth client

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the Google sign-in / identity APIs required for OAuth consent.
4. Configure the OAuth consent screen.
5. Create an **OAuth 2.0 Client ID** for a **Web application**.

### 2. Add redirect URIs

Add the browser redirect URL as an authorized redirect URI:

- Local example: `http://localhost:3000/signin`
- Production example: `https://scripts.example.com/signin`

The writer web now sends its own sign-in URL as the Google redirect target. If you want to pin that centrally, set `GOOGLE_REDIRECT_URI`.

### 3. Set environment variables

```bash
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=https://scripts.example.com/signin
IDENTITY_SERVICE_PUBLIC_URL=https://<your-public-identity-service-host>
```

For local development, `GOOGLE_REDIRECT_URI` can point at your local sign-in page, and `IDENTITY_SERVICE_PUBLIC_URL` can stay at the identity-service host used for internal auth routes.

### 4. Restart the identity service

Restart the identity service after changing the env vars so it picks up the real Google flow.

## Common Local URLs

- Writer web: `http://localhost:3000`
- API gateway: `http://localhost:4000`
- Identity service: `http://localhost:4005`

## Related Docs

- [Phase 1 overview](phase-1/README.md)
- [OAuth sign-in user manual](phase-1/oauth-signin-user-manual.md)
- [Environment template](../.env.example)
- [Deployment guide](deployment.md)
