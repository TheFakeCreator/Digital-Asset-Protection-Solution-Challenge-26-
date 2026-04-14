# Detection API Contract (Day 4)

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

## 1) Trigger Detection Search (Queued, Single Asset)

Endpoint: POST /api/v1/detections/search/{assetId}

Path:
- assetId: valid Mongo ObjectId

Behavior:
- Returns 202 Accepted immediately
- Enqueues a background detection job
- Job compares reference asset against candidate images using `python/detection_service.py`
- Detection matcher uses a crop-aware multi-hash profile (`phash`, `dhash`, `whash`, `ahash`) for stronger robustness to compression and moderate cropping
- Similarity score is 0-100; matches are flagged when score >= `DETECTION_SIMILARITY_THRESHOLD` (default 85, tuned via synthetic benchmark sweep)
- Candidate pool is sourced from crawler manifest (`backend/data/crawled/twitter/latest.json`) when available
- Python comparison responses are cached (`DETECTION_CACHE_TTL_SECONDS`) to reduce repeated work
- Matches are deduplicated by image signature even when multiple URLs reference the same image
- Existing detections are updated with history (`history[]`, `lastSeenAt`, `occurrenceCount`) instead of creating duplicates
- At most 5 top-confidence new matches are inserted per search job

Example response (202):

{
  "success": true,
  "data": {
    "job": {
      "id": "100227b1-e5e2-4f92-acc9-3f0edb3a9c46",
      "type": "single",
      "assetId": "69dd67f70176b5e183df3b8c",
      "assetIds": [],
      "status": "queued",
      "createdAt": "2026-04-14T00:03:00.000Z",
      "startedAt": null,
      "completedAt": null,
      "createdDetections": 0,
      "updatedDetections": 0,
      "totalAssets": 1,
      "processedAssets": 0,
      "batchResults": [],
      "error": ""
    }
  }
}

## 2) Trigger Detection Search (Queued, Batch)

Endpoint: POST /api/v1/detections/search/batch

Body:
- assetIds: array of valid Mongo ObjectId strings (1-25 entries)

Behavior:
- Returns 202 Accepted immediately
- Enqueues a single batch job that processes each asset with bounded concurrency (`DETECTION_BATCH_CONCURRENCY`)
- Each asset result includes status, created detection count, updated detection count, and optional error

Example request body:

{
  "assetIds": [
    "69dd67f70176b5e183df3b8c",
    "69dd67f70176b5e183df3b8d"
  ]
}

Example response (202):

{
  "success": true,
  "data": {
    "job": {
      "id": "3f2e0c3f-2a4f-4475-9f27-4a9af3477ab0",
      "type": "batch",
      "assetId": null,
      "assetIds": [
        "69dd67f70176b5e183df3b8c",
        "69dd67f70176b5e183df3b8d"
      ],
      "status": "queued",
      "createdAt": "2026-04-15T08:11:00.000Z",
      "startedAt": null,
      "completedAt": null,
      "createdDetections": 0,
      "updatedDetections": 0,
      "totalAssets": 2,
      "processedAssets": 0,
      "batchResults": [],
      "error": ""
    }
  }
}

## 3) Detection Job Status

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
    "type": "single",
    "assetId": "69dd67f70176b5e183df3b8c",
    "assetIds": [],
    "status": "completed",
    "createdAt": "2026-04-14T00:03:00.000Z",
    "startedAt": "2026-04-14T00:03:00.100Z",
    "completedAt": "2026-04-14T00:03:00.200Z",
    "createdDetections": 3,
    "updatedDetections": 2,
    "totalAssets": 1,
    "processedAssets": 1,
    "batchResults": [],
    "error": ""
  }
}

## 4) List Detections (Paginated)

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
        "imageSignature": "3a91d34f8a35ea88f8ec77ea0fbb8caaf6d7f5e2",
        "sourceLocalPath": "D:/.../fixtures/images/sample.jpg",
        "confidence": 60,
        "status": "pending",
        "dateFound": "2026-04-14T00:03:00.000Z",
        "lastSeenAt": "2026-04-14T00:05:00.000Z",
        "occurrenceCount": 3,
        "history": [
          {
            "url": "https://x.com/sportswire/status/3df3b88a25810",
            "platform": "twitter",
            "sourceLocalPath": "D:/.../fixtures/images/sample.jpg",
            "similarityScore": 60,
            "dateFound": "2026-04-14T00:03:00.000Z"
          }
        ]
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 3
  }
}

## 5) Detection Detail

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
- ASSET_NOT_FOUND (404): asset does not exist (single or batch search)
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
