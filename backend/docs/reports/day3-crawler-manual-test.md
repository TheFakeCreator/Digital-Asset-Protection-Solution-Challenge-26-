# Day 3 Crawler Manual Test Report

- Executed At: 2026-04-14 04:08 IST
- Platform: twitter
- Output Directory: backend/data/crawled/twitter
- Command Mode: offline-safe (`--no-live-fetch`) with synthetic fallback

## Crawler Execution Summary

- Collected Count: 120
- Local Image Count: 120
- Manifest File: backend/data/crawled/twitter/latest.json
- Source Type Distribution: synthetic_fallback=120
- Sample Item Local Path: backend/data/crawled/twitter/images/synthetic-0001.png

## Detection Integration Verification

A live integration run was executed after crawler generation:

- Uploaded asset ID: 69dd700531504e80fe401fa4
- Detection job ID: 2dc68a7c-4c1d-4f6f-862b-02dd0a04973b
- Final job status: completed
- Created detections: 5
- Listed detections for uploaded asset: 5

## Sample Validation Output

~~~json
{
  "platform": "twitter",
  "count": 120,
  "source_types": {
    "type": "synthetic_fallback",
    "count": 120
  }
}
~~~

~~~json
{
  "assetId": "69dd700531504e80fe401fa4",
  "jobId": "2dc68a7c-4c1d-4f6f-862b-02dd0a04973b",
  "jobStatus": "completed",
  "createdDetections": 5,
  "totalDetections": 5
}
~~~
