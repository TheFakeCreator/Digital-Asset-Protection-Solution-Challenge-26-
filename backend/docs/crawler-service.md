# Crawler Service (Day 4)

Python crawler entrypoints:

- backend/python/crawler_service.py (primary implementation)
- backend/python/crawler_worker.py (compatibility wrapper)

## Purpose

Collect platform media candidates for detection matching, with resilient behavior when external API access is unavailable.

## Platform Support

Current supported platforms:

- twitter
- youtube
- reddit
- instagram (placeholder connector; synthetic fallback until Meta access scope is approved)
- facebook (placeholder connector; synthetic fallback until Meta access scope is approved)
- all (runs all platforms in one command)

Collection strategy by platform:

1. twitter:
	- Uses X recent search API when X_BEARER_TOKEN is present.
	- Falls back to RSS-style scraping through Nitter instances if API yields no candidates.
2. youtube:
	- Uses YouTube Data API v3 search endpoint when YOUTUBE_API_KEY is present.
	- Uses video thumbnails as candidate images.
3. reddit:
	- Uses public subreddit JSON search endpoints (sports-focused subreddits).
4. instagram and facebook:
	- Connector path is scaffolded and credential-aware.
	- Uses synthetic fallback until Meta app permissions are approved.

For each platform, candidate images are downloaded and persisted locally for downstream fingerprint comparison.

## Reliability Controls

The crawler supports the following runtime safeguards:

- Retry with incremental delay per failed request.
- Request-level rate limiting between network calls.
- Rotating user-agent header strategy across requests.
- Bounded output size with limit range 1-500.
- JSON manifest output for downstream services.
- Local file persistence for each retained item.
- Automatic synthetic fallback when live fetch is insufficient.
- Automatic loading of backend .env and .env.local credentials.

## Output Structure

Default output directory:

backend/data/crawled

Produced artifacts:

- <platform>/latest.json (latest platform manifest)
- <platform>/crawl-<timestamp>.json (versioned platform manifest)
- <platform>/images/ (local candidate images for matching)
- latest.json (merged manifest when using --platform all)
- crawl-<timestamp>.json (merged versioned manifest when using --platform all)

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

- <configured CRAWLER_OUTPUT_DIR>/latest.json

Recommended value for multi-platform detection:

- CRAWLER_OUTPUT_DIR=data/crawled

If crawler manifest is absent, detection falls back to fixture images.

## Environment Variables

- X_BEARER_TOKEN (optional but recommended for live Twitter API)
- YOUTUBE_API_KEY (required for live YouTube fetch)
- REDDIT_USER_AGENT (optional override)
- META_ACCESS_TOKEN (required to move instagram/facebook beyond placeholder mode)

## Example Command

Run deterministic sample crawl (offline-safe all platforms):

python crawler_service.py --platform all --keywords sports athletic football basketball olympics --limit 120 --no-live-fetch --output-dir ../data/crawled

Run live YouTube sample (requires YOUTUBE_API_KEY):

python crawler_service.py --platform youtube --keywords sports --limit 10 --output-dir ../data/crawled

Run live Twitter sample (tries X API then RSS fallback):

python crawler_service.py --platform twitter --keywords sports athletic football basketball olympics --limit 120 --output-dir ../data/crawled

Run wrapper command:

python crawler_worker.py --platform all --limit 120 --no-live-fetch --output-dir ../data/crawled
