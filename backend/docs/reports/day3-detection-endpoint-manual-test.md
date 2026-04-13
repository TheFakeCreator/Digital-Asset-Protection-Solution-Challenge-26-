# Day 3 Detection Endpoint Manual Test Report

- Executed At: 2026-04-14 03:32 IST
- Base URL: http://localhost:3001
- Fixture Upload Source: backend/fixtures/images/fixture-03.png

## Endpoint Results

- POST /api/v1/assets => created assetId=69dd67f70176b5e183df3b8c
- POST /api/v1/detections/search/{assetId} => accepted with jobId=100227b1-e5e2-4f92-acc9-3f0edb3a9c46
- GET /api/v1/detections/jobs/{jobId} => status=completed, createdDetections=3
- GET /api/v1/detections?asset_id={assetId}&page=1&limit=5 => total=3
- GET /api/v1/detections/{id} => first detection platform=twitter, confidence=60

## Verification Summary

- Queueing confirmed: detection job lifecycle progressed from queued to completed.
- Persistence confirmed: 3 detection records were created and returned by paginated list endpoint.
- Detail retrieval confirmed: detection detail endpoint returned expected record.

## Sample Validation Output

~~~json
{
  "assetId": "69dd67f70176b5e183df3b8c",
  "jobId": "100227b1-e5e2-4f92-acc9-3f0edb3a9c46",
  "jobStatus": "completed",
  "createdDetections": 3,
  "listTotal": 3,
  "firstDetectionId": "69dd67f70176b5e183df3b8e",
  "firstDetectionPlatform": "twitter",
  "firstDetectionConfidence": 60
}
~~~
