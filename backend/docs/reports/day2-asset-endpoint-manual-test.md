# Day 2 Asset Endpoint Manual Test Report

- Executed At: 2026-04-14 03:24:27
- Base URL: http://localhost:3001
- Fixture File: D:\Sanskar\programming\projects\Solution Challenge 2026\backend\fixtures\images\fixture-02.png

## Endpoint Results

- GET / => success=True
- GET /api/v1/health => status=ok
- POST /api/v1/assets => assetId=69dd6615ddb11aeebceb4cf8
- GET /api/v1/assets => total=2
- GET /api/v1/assets/{id} => name=Manual Fixture Upload 032427
- POST /api/v1/assets/fingerprints/batch => count=1
- DELETE /api/v1/assets/{id} => status=deleted
- GET /api/v1/assets/{id} after delete => status-404

## Sample Responses

### Upload

~~~json
{
    "success":  true,
    "data":  {
                 "asset":  {
                               "name":  "Manual Fixture Upload 032427",
                               "creator":  "Manual QA",
                               "eventDate":  "2026-04-14T00:00:00.000Z",
                               "fingerprintHash":  "81f07f0f7c0f2a07",
                               "originalFileName":  "fixture-02.png",
                               "mimeType":  "image/png",
                               "sizeBytes":  1658,
                               "filePath":  "uploads/1776117267954-266ec52f.png",
                               "fileUrl":  "/uploads/1776117267954-266ec52f.png",
                               "status":  "active",
                               "_id":  "69dd6615ddb11aeebceb4cf8",
                               "uploadDate":  "2026-04-13T21:54:29.572Z",
                               "createdAt":  "2026-04-13T21:54:29.572Z",
                               "updatedAt":  "2026-04-13T21:54:29.572Z",
                               "__v":  0
                           },
                 "fingerprint":  {
                                     "hash":  "81f07f0f7c0f2a07",
                                     "algorithm":  "phash",
                                     "input_path":  "D:\\Sanskar\\programming\\projects\\Solution Challenge 2026\\backend\\uploads\\1776117267954-266ec52f.png"
                                 }
             }
}
~~~

### Batch

~~~json
{
    "success":  true,
    "data":  {
                 "count":  1,
                 "results":  [
                                 {
                                     "assetId":  "69dd6615ddb11aeebceb4cf8",
                                     "hash":  "81f07f0f7c0f2a07",
                                     "algorithm":  "phash",
                                     "inputPath":  "D:\\Sanskar\\programming\\projects\\Solution Challenge 2026\\backend\\uploads\\1776117267954-266ec52f.png"
                                 }
                             ]
             }
}
~~~
