# Industry Vetting and Access Control User Manual

Last updated: 2026-02-22

## Overview

This guide covers the Phase 5 foundation flows for:

- industry account application
- manual reviewer verification
- writer-controlled industry entitlement grants
- entitlement checks for view/download permissions

## API Endpoints

Gateway endpoints:

- `POST /api/v1/industry/accounts`
- `GET /api/v1/industry/accounts/:accountId`
- `POST /api/v1/industry/accounts/:accountId/verify`
- `PUT /api/v1/industry/entitlements/:writerUserId`
- `GET /api/v1/industry/entitlements/:writerUserId/check`

Internal service endpoints:

- `POST /internal/accounts`
- `GET /internal/accounts/:accountId`
- `POST /internal/accounts/:accountId/verify`
- `PUT /internal/entitlements/:writerUserId`
- `GET /internal/entitlements/:writerUserId/check`

## Example Flows

Create an industry account application:

```bash
curl -X POST http://localhost:4000/api/v1/industry/accounts \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{
    "companyName": "Studio One",
    "roleTitle": "Development Executive",
    "professionalEmail": "exec@studioone.com",
    "websiteUrl": "",
    "linkedinUrl": "",
    "imdbUrl": ""
  }'
```

Verify an industry account (allowlisted admin):

```bash
curl -X POST http://localhost:4000/api/v1/industry/accounts/<account-id>/verify \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "status": "verified",
    "verificationNotes": "Validated employer and credits."
  }'
```

Grant writer-controlled entitlement:

```bash
curl -X PUT http://localhost:4000/api/v1/industry/entitlements/writer_01 \
  -H "authorization: Bearer <writer-session-token>" \
  -H "content-type: application/json" \
  -d '{
    "industryAccountId": "<account-id>",
    "accessLevel": "download"
  }'
```

Check entitlement:

```bash
curl "http://localhost:4000/api/v1/industry/entitlements/writer_01/check?industryAccountId=<account-id>"
```
