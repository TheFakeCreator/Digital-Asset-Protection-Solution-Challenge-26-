param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$FixtureFile = "../fixtures/images/fixture-01.png",
    [string]$ReportFile = "../docs/reports/day2-asset-endpoint-manual-test.md"
)

$ErrorActionPreference = "Stop"

function Resolve-PathStrict([string]$PathValue) {
    $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction Stop
    return $resolved.Path
}

$fixturePath = Resolve-PathStrict $FixtureFile
$reportPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $ReportFile))
$reportDir = Split-Path -Path $reportPath -Parent
if (-not (Test-Path -LiteralPath $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir | Out-Null
}

$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$uploadName = "Manual Fixture Upload $((Get-Date).ToString('HHmmss'))"

$root = Invoke-RestMethod -Uri "$BaseUrl/" -Method Get
$health = Invoke-RestMethod -Uri "$BaseUrl/api/v1/health" -Method Get

$uploadRaw = curl.exe -s -X POST "$BaseUrl/api/v1/assets" `
    -F "name=$uploadName" `
    -F "creator=Manual QA" `
    -F "eventDate=2026-04-14" `
    -F "media=@$fixturePath;type=image/png"

if (-not $uploadRaw) {
    throw "Upload endpoint returned empty output."
}

$upload = $uploadRaw | ConvertFrom-Json
if (-not $upload.success -or -not $upload.data.asset._id) {
    throw "Upload endpoint did not return expected asset id."
}

$assetId = [string]$upload.data.asset._id

$list = Invoke-RestMethod -Uri "$BaseUrl/api/v1/assets?page=1&limit=10" -Method Get
$getById = Invoke-RestMethod -Uri "$BaseUrl/api/v1/assets/$assetId" -Method Get

$batchRequest = @{ assetIds = @($assetId) } | ConvertTo-Json -Depth 4
$batch = Invoke-RestMethod -Uri "$BaseUrl/api/v1/assets/fingerprints/batch" -Method Post -ContentType "application/json" -Body $batchRequest

$delete = Invoke-RestMethod -Uri "$BaseUrl/api/v1/assets/$assetId" -Method Delete

$deleteVerification = "unexpected-success"
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/assets/$assetId" -Method Get | Out-Null
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $deleteVerification = "status-$statusCode"
}

$report = @"
# Day 2 Asset Endpoint Manual Test Report

- Executed At: $timestamp
- Base URL: $BaseUrl
- Fixture File: $fixturePath

## Endpoint Results

- GET / => success=$($root.success)
- GET /api/v1/health => status=$($health.data.status)
- POST /api/v1/assets => assetId=$assetId
- GET /api/v1/assets => total=$($list.data.total)
- GET /api/v1/assets/{id} => name=$($getById.data.name)
- POST /api/v1/assets/fingerprints/batch => count=$($batch.data.count)
- DELETE /api/v1/assets/{id} => status=$($delete.data.status)
- GET /api/v1/assets/{id} after delete => $deleteVerification

## Sample Responses

### Upload

~~~json
$($upload | ConvertTo-Json -Depth 8)
~~~

### Batch

~~~json
$($batch | ConvertTo-Json -Depth 8)
~~~
"@

Set-Content -LiteralPath $reportPath -Value $report -Encoding UTF8
Write-Output "Manual API smoke test report written to: $reportPath"
