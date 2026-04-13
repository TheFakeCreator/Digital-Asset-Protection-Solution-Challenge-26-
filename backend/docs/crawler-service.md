# Crawler Service (Day 3)

Python crawler entrypoints:

- backend/python/crawler_service.py (primary implementation)
- backend/python/crawler_worker.py (compatibility wrapper)

## Purpose

Collect platform media candidates for detection matching, with resilient behavior when external platform scraping is unavailable.

## Platform Support

Current implemented platform:

- twitter

Collection strategy for twitter:

1. Attempt RSS-style search scraping through public Nitter instances.
2. Query sports-related keywords with image filter terms.
3. Extract candidate image URLs and source post URLs.
4. Download candidate images to a local folder for fingerprint comparison.
5. If live collection is insufficient or unavailable, generate synthetic fallback samples from fixture images.

## Reliability Controls

The crawler supports the following runtime safeguards:

- Retry with incremental delay per failed request.
- Request-level rate limiting between network calls.
- Bounded output size with limit range 1-500.
- JSON manifest output for downstream services.
- Local file persistence for each retained item.

## Output Structure

Default output directory:

backend/data/crawled/twitter

Produced artifacts:

- latest.json (latest crawl manifest)
- crawl-<timestamp>.json (versioned manifest)
- images/ (local candidate images for matching)

Manifest item fields:

- platform
- keyword
- source_url
- image_url
- source_type
- local_path
- download_status

## Detection Integration

Detection search service reads from:

- backend/data/crawled/twitter/latest.json

If crawler manifest is absent, detection falls back to fixture images.

## Example Command

Run deterministic sample crawl (offline-safe):

python crawler_service.py --platform twitter --keywords sports athletic football basketball olympics --limit 120 --no-live-fetch --output-dir ../data/crawled/twitter

Run wrapper command:

python crawler_worker.py --platform twitter --limit 120 --no-live-fetch --output-dir ../data/crawled/twitter
