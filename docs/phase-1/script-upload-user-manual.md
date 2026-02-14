# Script Upload User Manual (Writer Web)

This guide covers uploading a script file and attaching it to a project draft in writer-web.

## Prerequisites

- You are signed in to writer-web.
- Services are running:
  - `@script-manifest/writer-web`
  - `@script-manifest/api-gateway`
  - `@script-manifest/script-storage-service`

## UI Flow (`/projects`)

1. Open `Projects` and select an existing project.
2. In `Draft Lifecycle`, click `Create draft`.
3. In the modal:
   - Choose a local script file in `Script file`.
   - Click `Upload + register script`.
4. Wait for status text: `Script uploaded and registered (<scriptId>)`.
5. Confirm `Script ID` is filled with the returned ID.
6. Enter `Version label` and other draft fields.
7. Click `Create draft`.

Result: the draft is created with the uploaded script's `scriptId` and appears in the Draft Lifecycle list.

## API Path (End-to-End)

The upload flow from writer-web goes through these endpoints:

1. `POST /api/v1/scripts/upload-session` (writer-web route)
2. `POST /api/v1/scripts/upload-session` (api-gateway route)
3. `POST /internal/scripts/upload-session` (script-storage-service)
4. `POST /api/v1/scripts/upload` (writer-web route, server-side upload proxy)
5. `POST <uploadUrl>` (writer-web server uploads to MinIO using presigned form fields)
6. `POST /api/v1/scripts/register` (writer-web route)
7. `POST /api/v1/scripts/register` (api-gateway route)
8. `POST /internal/scripts/register` (script-storage-service)

## Troubleshooting

- `Select a script file before uploading.`
  - You clicked upload without choosing a file.
- `Unable to create script upload session.`
  - Check gateway and script-storage-service health.
- `Upload failed.`
  - Check storage endpoint reachability/CORS and upload URL.
- `Unable to register uploaded script.`
  - Verify script-storage-service is reachable and request payload is valid.
- `Upload/register a script or enter a script ID first.`
  - Draft creation requires a `scriptId`.
