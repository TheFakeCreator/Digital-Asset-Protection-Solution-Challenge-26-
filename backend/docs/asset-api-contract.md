# Asset API Contract (Day 2)

Base URL: http://localhost:3001

All successful responses use:

{
  "success": true,
  "data": {}
}

All error responses use:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}

## 1) Health Check

Endpoint: GET /api/v1/health

Example response (200):

{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-04-14T13:20:10.000Z",
    "uptimeSeconds": 125
  }
}

## 2) Create Asset

Endpoint: POST /api/v1/assets

Request type: multipart/form-data

Fields:
- name: string (required, min 1, max 120)
- creator: string (required, min 1, max 120)
- eventDate: date string (required)
- media: file (required, jpeg/png/webp/gif)

Example response (201):

{
  "success": true,
  "data": {
    "asset": {
      "_id": "67fcd8b4e7e31b872a4e1234",
      "name": "Fixture Upload",
      "creator": "QA Team",
      "eventDate": "2026-04-14T00:00:00.000Z",
      "uploadDate": "2026-04-14T13:20:10.000Z",
      "fingerprintHash": "e998966998966998",
      "originalFileName": "fixture-01.png",
      "mimeType": "image/png",
      "sizeBytes": 4512,
      "filePath": "uploads/1776115009818-09b321d5.png",
      "fileUrl": "/uploads/1776115009818-09b321d5.png"
    },
    "fingerprint": {
      "hash": "e998966998966998",
      "algorithm": "phash",
      "input_path": "D:/.../uploads/1776115009818-09b321d5.png"
    }
  }
}

## 3) List Assets

Endpoint: GET /api/v1/assets?page=1&limit=20

Query:
- page: integer >= 1 (default 1)
- limit: integer 1-100 (default 20)

Example response (200):

{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "limit": 20,
    "total": 0
  }
}

## 4) Get Asset By ID

Endpoint: GET /api/v1/assets/{id}

Path:
- id: valid Mongo ObjectId

Example response (200):

{
  "success": true,
  "data": {
    "_id": "67fcd8b4e7e31b872a4e1234",
    "name": "Fixture Upload",
    "creator": "QA Team"
  }
}

## 5) Delete Asset

Endpoint: DELETE /api/v1/assets/{id}

Path:
- id: valid Mongo ObjectId

Example response (200):

{
  "success": true,
  "data": {
    "id": "67fcd8b4e7e31b872a4e1234",
    "status": "deleted"
  }
}

## 6) Batch Fingerprint Recompute

Endpoint: POST /api/v1/assets/fingerprints/batch

Request type: application/json

Body:

{
  "assetIds": [
    "67fcd8b4e7e31b872a4e1234",
    "67fcd8d4e7e31b872a4e5678"
  ]
}

Constraints:
- assetIds: 1-25 IDs
- each ID must exist and have a reachable local file path

Example response (200):

{
  "success": true,
  "data": {
    "count": 2,
    "results": [
      {
        "assetId": "67fcd8b4e7e31b872a4e1234",
        "hash": "e998966998966998",
        "algorithm": "phash",
        "inputPath": "D:/.../uploads/1776115009818-09b321d5.png"
      }
    ]
  }
}

## Common Error Codes

- VALIDATION_ERROR (400): invalid request payload/query
- FILE_REQUIRED (400): missing media field in multipart form
- INVALID_FILE_TYPE (400): media mime type not allowed
- FILE_TOO_LARGE (400): media exceeds MAX_UPLOAD_SIZE_MB
- INVALID_ASSET_ID (400): malformed Mongo ObjectId
- ASSET_NOT_FOUND (404): ID not found
- ASSET_FILE_NOT_FOUND (404): asset file path missing on disk
- DATABASE_UNAVAILABLE (503): MongoDB not connected
- FINGERPRINT_PROCESS_ERROR (502): Python process failed
- FINGERPRINT_PARSE_ERROR (502): non-JSON or invalid fingerprint payload
- FINGERPRINT_TIMEOUT (504): Python process exceeded timeout
