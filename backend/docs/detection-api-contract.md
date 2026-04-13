# Detection API Contract (Day 3)

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

## 1) Trigger Detection Search (Queued)

Endpoint: POST /api/v1/detections/search/{assetId}

Path:
- assetId: valid Mongo ObjectId

Behavior:
- Returns 202 Accepted immediately
- Enqueues a background detection job
- Job compares reference asset against candidate images using `python/detection_service.py`
- Similarity score is 0-100; matches are flagged when score >= `DETECTION_SIMILARITY_THRESHOLD` (default 85)

Example response (202):

{
  "success": true,
  "data": {
    "job": {
      "id": "100227b1-e5e2-4f92-acc9-3f0edb3a9c46",
      "assetId": "69dd67f70176b5e183df3b8c",
      "status": "queued",
      "createdAt": "2026-04-14T00:03:00.000Z",
      "startedAt": null,
      "completedAt": null,
      "createdDetections": 0,
      "error": ""
    }
  }
}

## 2) Detection Job Status

Endpoint: GET /api/v1/detections/jobs/{jobId}

Path:
- jobId: detection queue job UUID

Statuses:
- queued
- running
- completed
- failed

Example response (200):

{
  "success": true,
  "data": {
    "id": "100227b1-e5e2-4f92-acc9-3f0edb3a9c46",
    "assetId": "69dd67f70176b5e183df3b8c",
    "status": "completed",
    "createdAt": "2026-04-14T00:03:00.000Z",
    "startedAt": "2026-04-14T00:03:00.100Z",
    "completedAt": "2026-04-14T00:03:00.200Z",
    "createdDetections": 3,
    "error": ""
  }
}

## 3) List Detections (Paginated)

Endpoint: GET /api/v1/detections?asset_id={assetId}&page=1&limit=20

Query:
- asset_id: optional, valid Mongo ObjectId
- page: integer >= 1 (default 1)
- limit: integer 1-100 (default 20)

Example response (200):

{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "69dd67f70176b5e183df3b8e",
        "assetId": {
          "_id": "69dd67f70176b5e183df3b8c",
          "name": "Detection API Fixture",
          "creator": "Detection QA"
        },
        "platform": "twitter",
        "url": "https://x.com/sportswire/status/3df3b88a25810",
        "confidence": 60,
        "status": "pending",
        "dateFound": "2026-04-14T00:03:00.000Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 3
  }
}

## 4) Detection Detail

Endpoint: GET /api/v1/detections/{id}

Path:
- id: valid detection Mongo ObjectId

Example response (200):

{
  "success": true,
  "data": {
    "_id": "69dd67f70176b5e183df3b8e",
    "platform": "twitter",
    "url": "https://x.com/sportswire/status/3df3b88a25810",
    "confidence": 60,
    "status": "pending"
  }
}

## Common Error Codes

- INVALID_ASSET_ID (400): malformed asset ID
- INVALID_DETECTION_ID (400): malformed detection ID
- ASSET_NOT_FOUND (404): asset does not exist
- DETECTION_NOT_FOUND (404): detection does not exist
- DETECTION_JOB_NOT_FOUND (404): unknown job ID
- DATABASE_UNAVAILABLE (503): MongoDB not connected
- VALIDATION_ERROR (400): invalid query parameters

## Detection Service Edge Handling

`detection_service.py` applies these rules during batch comparison:

- Corrupted candidate files are marked with `status=error`, `error_code=CORRUPTED_IMAGE`
- Very small candidate files (below minimum size) are marked with `status=skipped`, `error_code=IMAGE_TOO_SMALL`
- Missing files are marked with `status=error`, `error_code=FILE_NOT_FOUND`

Non-`ok` candidate items are ignored when persisting detection records.
