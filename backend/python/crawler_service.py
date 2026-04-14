import argparse
import hashlib
import json
import os
import random
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlencode, urlparse
from xml.etree import ElementTree

import requests


DEFAULT_KEYWORDS = [
    "sports",
    "athletic",
    "football",
    "basketball",
    "olympics",
]

SUPPORTED_PLATFORMS = ["twitter", "instagram", "reddit", "facebook", "youtube", "all"]

NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
]

REDDIT_SUBREDDITS = ["sports", "nba", "soccer", "olympics"]

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]


def load_env_file(file_path, override=False):
    if not file_path.exists() or not file_path.is_file():
        return

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue

        if value and ((value[0] == value[-1]) and value[0] in {"'", '"'}):
            value = value[1:-1]

        if override or key not in os.environ:
            os.environ[key] = value


def load_local_env():
    backend_root = Path(__file__).resolve().parent.parent
    load_env_file(backend_root / ".env", override=False)
    load_env_file(backend_root / ".env.local", override=True)


load_local_env()


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def safe_slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "item"


def env_value(name):
    value = os.getenv(name)
    if not value:
        return ""
    return value.strip()


def build_parser():
    parser = argparse.ArgumentParser(description="Crawl sports-related media for platform monitoring")
    parser.add_argument(
        "--platform",
        default="twitter",
        choices=SUPPORTED_PLATFORMS,
        help="Target platform or all",
    )
    parser.add_argument("--keywords", nargs="+", default=DEFAULT_KEYWORDS, help="Search keywords")
    parser.add_argument("--limit", type=int, default=120, help="Number of records to store per platform (1-500)")
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout in seconds")
    parser.add_argument("--retry-count", type=int, default=2, help="Retries per request")
    parser.add_argument(
        "--retry-delay-ms",
        type=int,
        default=450,
        help="Base retry delay in milliseconds",
    )
    parser.add_argument(
        "--rate-limit-ms",
        type=int,
        default=250,
        help="Delay between requests in milliseconds",
    )
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent.parent / "data" / "crawled"),
        help="Base directory where crawl output and images are stored",
    )
    parser.add_argument(
        "--no-live-fetch",
        action="store_true",
        help="Skip remote requests and generate synthetic records only",
    )
    parser.add_argument(
        "--no-synthetic-fallback",
        action="store_true",
        help="Disable synthetic fallback when live collection is insufficient",
    )
    return parser


def wait_for_rate_limit(state, rate_limit_ms):
    last_request_at = state.get("last_request_at")
    if last_request_at is not None:
        elapsed_ms = (time.monotonic() - last_request_at) * 1000
        remaining_ms = rate_limit_ms - elapsed_ms
        if remaining_ms > 0:
            time.sleep(remaining_ms / 1000)
    state["last_request_at"] = time.monotonic()


def build_headers(extra_headers=None):
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json, text/html, application/xml;q=0.9, */*;q=0.8",
    }
    if extra_headers:
        headers.update(extra_headers)
    return headers


def request_with_retry(session, url, timeout, retry_count, retry_delay_ms, rate_limit_ms, state, headers=None):
    last_error = None
    for attempt in range(retry_count + 1):
        wait_for_rate_limit(state, rate_limit_ms)
        try:
            response = session.get(url, timeout=timeout, headers=build_headers(headers))
            if response.status_code != 200:
                raise requests.HTTPError(f"HTTP {response.status_code} for {url}")
            return response
        except Exception as exc:
            last_error = exc
            if attempt < retry_count:
                delay_ms = retry_delay_ms * (attempt + 1)
                time.sleep(delay_ms / 1000)
    raise last_error


def extract_image_urls_from_description(description_html):
    if not description_html:
        return []
    return re.findall(r"<img[^>]+src=\"([^\"]+)\"", description_html)


def parse_rss_items(rss_text, keyword, instance):
    media_ns = {"media": "http://search.yahoo.com/mrss/"}
    root = ElementTree.fromstring(rss_text)

    results = []
    seen_pairs = set()

    for item in root.findall("./channel/item"):
        source_url = (item.findtext("link") or "").strip()
        if not source_url:
            continue

        image_urls = []

        for enclosure in item.findall("enclosure"):
            media_type = (enclosure.attrib.get("type") or "").lower()
            url_value = enclosure.attrib.get("url") or ""
            if media_type.startswith("image/") and url_value:
                image_urls.append(url_value)

        for media_content in item.findall("media:content", media_ns):
            media_url = media_content.attrib.get("url") or ""
            if media_url:
                image_urls.append(media_url)

        description = item.findtext("description") or ""
        image_urls.extend(extract_image_urls_from_description(description))

        for image_url in image_urls:
            key = (source_url, image_url)
            if key in seen_pairs:
                continue
            seen_pairs.add(key)

            results.append(
                {
                    "platform": "twitter",
                    "keyword": keyword,
                    "source_url": source_url,
                    "image_url": image_url,
                    "source_type": f"live_rss:{instance}",
                }
            )

    return results


def parse_twitter_api_items(payload, keyword):
    media_by_key = {}
    includes = payload.get("includes") or {}
    for media in includes.get("media") or []:
        media_key = (media.get("media_key") or "").strip()
        if not media_key:
            continue

        image_url = (media.get("url") or media.get("preview_image_url") or "").strip()
        media_type = (media.get("type") or "").strip().lower()

        if not image_url or media_type not in {"photo", "animated_gif", "video"}:
            continue

        media_by_key[media_key] = image_url

    parsed = []
    for tweet in payload.get("data") or []:
        tweet_id = (tweet.get("id") or "").strip()
        if not tweet_id:
            continue

        media_keys = (((tweet.get("attachments") or {}).get("media_keys")) or [])
        for media_key in media_keys:
            image_url = media_by_key.get(media_key)
            if not image_url:
                continue

            parsed.append(
                {
                    "platform": "twitter",
                    "keyword": keyword,
                    "source_url": f"https://x.com/i/web/status/{tweet_id}",
                    "image_url": image_url,
                    "source_type": "live_api:x_recent_search",
                }
            )

    return parsed


def collect_live_twitter_via_x_api(keywords, limit, timeout, retry_count, retry_delay_ms, rate_limit_ms):
    bearer_token = env_value("X_BEARER_TOKEN")
    if not bearer_token:
        return [], "X_BEARER_TOKEN missing; falling back to rss scraping"

    session = requests.Session()
    state = {"last_request_at": None}
    collected = []
    seen_image_urls = set()

    for keyword in keywords:
        if len(collected) >= limit:
            break

        query = quote(f"{keyword} has:media -is:retweet lang:en")
        api_url = (
            "https://api.x.com/2/tweets/search/recent"
            f"?query={query}&max_results=25"
            "&expansions=attachments.media_keys"
            "&media.fields=media_key,type,url,preview_image_url"
        )

        try:
            response = request_with_retry(
                session,
                api_url,
                timeout,
                retry_count,
                retry_delay_ms,
                rate_limit_ms,
                state,
                headers={"Authorization": f"Bearer {bearer_token}"},
            )
            payload = response.json()
            api_items = parse_twitter_api_items(payload, keyword)
        except Exception:
            continue

        for item in api_items:
            image_url = item["image_url"]
            if image_url in seen_image_urls:
                continue
            seen_image_urls.add(image_url)
            collected.append(item)
            if len(collected) >= limit:
                break

    if collected:
        return collected, "live x api used"

    return [], "x api yielded no image candidates; falling back to rss scraping"


def collect_live_twitter_via_rss(keywords, limit, timeout, retry_count, retry_delay_ms, rate_limit_ms):
    session = requests.Session()
    state = {"last_request_at": None}
    collected = []
    seen_image_urls = set()

    for keyword in keywords:
        if len(collected) >= limit:
            break

        query = quote(f"{keyword} filter:images")
        keyword_results = []

        for instance in NITTER_INSTANCES:
            rss_url = f"{instance}/search/rss?f=tweets&q={query}"
            try:
                response = request_with_retry(
                    session,
                    rss_url,
                    timeout,
                    retry_count,
                    retry_delay_ms,
                    rate_limit_ms,
                    state,
                )
                keyword_results = parse_rss_items(response.text, keyword, instance)
                if keyword_results:
                    break
            except Exception:
                continue

        for item in keyword_results:
            image_url = item["image_url"]
            if image_url in seen_image_urls:
                continue
            seen_image_urls.add(image_url)
            collected.append(item)
            if len(collected) >= limit:
                break

    return collected, "live nitter rss used"


def collect_live_twitter_records(keywords, limit, timeout, retry_count, retry_delay_ms, rate_limit_ms):
    from_api, api_note = collect_live_twitter_via_x_api(
        keywords,
        limit,
        timeout,
        retry_count,
        retry_delay_ms,
        rate_limit_ms,
    )
    if from_api:
        return from_api, api_note

    from_rss, rss_note = collect_live_twitter_via_rss(
        keywords,
        limit,
        timeout,
        retry_count,
        retry_delay_ms,
        rate_limit_ms,
    )
    if from_rss:
        return from_rss, rss_note

    return [], f"{api_note}; rss fallback returned no results"


def collect_live_youtube_records(keywords, limit, timeout, retry_count, retry_delay_ms, rate_limit_ms):
    api_key = env_value("YOUTUBE_API_KEY")
    if not api_key:
        return [], "YOUTUBE_API_KEY missing; live YouTube collection skipped"

    session = requests.Session()
    state = {"last_request_at": None}
    collected = []
    seen_urls = set()

    for keyword in keywords:
        if len(collected) >= limit:
            break

        params = {
            "part": "snippet",
            "q": f"{keyword} sports",
            "type": "video",
            "maxResults": 25,
            "key": api_key,
        }

        search_url = f"https://www.googleapis.com/youtube/v3/search?{urlencode(params)}"

        try:
            response = request_with_retry(
                session,
                search_url,
                timeout,
                retry_count,
                retry_delay_ms,
                rate_limit_ms,
                state,
            )
            payload = response.json()
        except Exception:
            continue

        for item in payload.get("items", []):
            video_id = (((item.get("id") or {}).get("videoId")) or "").strip()
            if not video_id:
                continue

            snippet = item.get("snippet") or {}
            thumbnails = snippet.get("thumbnails") or {}
            image_url = ""
            for key_name in ["high", "medium", "default"]:
                thumb = thumbnails.get(key_name) or {}
                candidate_url = (thumb.get("url") or "").strip()
                if candidate_url:
                    image_url = candidate_url
                    break

            if not image_url or image_url in seen_urls:
                continue

            seen_urls.add(image_url)
            collected.append(
                {
                    "platform": "youtube",
                    "keyword": keyword,
                    "source_url": f"https://youtube.com/watch?v={video_id}",
                    "image_url": image_url,
                    "source_type": "live_api:youtube_search",
                }
            )
            if len(collected) >= limit:
                break

    return collected, "live youtube api used"


def extract_reddit_image(post):
    preview = post.get("preview") or {}
    images = preview.get("images") or []
    for image in images:
        source = image.get("source") or {}
        url = (source.get("url") or "").replace("&amp;", "&").strip()
        if url:
            return url

    url_value = (post.get("url_overridden_by_dest") or post.get("url") or "").strip()
    if any(url_value.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
        return url_value

    return ""


def collect_live_reddit_records(keywords, limit, timeout, retry_count, retry_delay_ms, rate_limit_ms):
    session = requests.Session()
    state = {"last_request_at": None}
    collected = []
    seen_urls = set()

    for keyword in keywords:
        if len(collected) >= limit:
            break

        for subreddit in REDDIT_SUBREDDITS:
            if len(collected) >= limit:
                break

            params = {
                "q": keyword,
                "restrict_sr": "1",
                "sort": "new",
                "limit": "25",
            }
            reddit_url = f"https://www.reddit.com/r/{subreddit}/search.json?{urlencode(params)}"

            try:
                response = request_with_retry(
                    session,
                    reddit_url,
                    timeout,
                    retry_count,
                    retry_delay_ms,
                    rate_limit_ms,
                    state,
                    headers={"Accept": "application/json"},
                )
                payload = response.json()
            except Exception:
                continue

            children = (((payload.get("data") or {}).get("children")) or [])
            for child in children:
                data = child.get("data") or {}
                image_url = extract_reddit_image(data)
                source_url = (data.get("url") or data.get("permalink") or "").strip()
                if source_url.startswith("/"):
                    source_url = f"https://www.reddit.com{source_url}"

                if not image_url or image_url in seen_urls or not source_url:
                    continue

                seen_urls.add(image_url)
                collected.append(
                    {
                        "platform": "reddit",
                        "keyword": keyword,
                        "source_url": source_url,
                        "image_url": image_url,
                        "source_type": "live_public:reddit_json",
                    }
                )

                if len(collected) >= limit:
                    break

    return collected, "live public reddit json used"


def collect_meta_placeholder_records(platform):
    token = env_value("META_ACCESS_TOKEN")
    if not token:
        return [], "META_ACCESS_TOKEN missing; live collection skipped"

    return [], f"{platform} connector placeholder active; API integration pending app review scope"


def guess_extension_from_url(url):
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return ext
    return ".jpg"


def download_image(session, image_url, destination_path, timeout, retry_count, retry_delay_ms, rate_limit_ms, state):
    response = request_with_retry(
        session,
        image_url,
        timeout,
        retry_count,
        retry_delay_ms,
        rate_limit_ms,
        state,
    )

    content_type = (response.headers.get("Content-Type") or "").lower()
    if content_type and "image" not in content_type:
        raise ValueError(f"Unexpected content type: {content_type}")

    destination_path.write_bytes(response.content)


def fixture_files():
    fixture_dir = Path(__file__).resolve().parent.parent / "fixtures" / "images"
    if not fixture_dir.exists():
        return []
    return sorted(path for path in fixture_dir.iterdir() if path.is_file())


def synthetic_source_url(platform, keyword, index):
    slug = safe_slug(keyword)
    num = index + 1
    if platform == "youtube":
        return f"https://youtube.com/watch?v=synthetic-{slug}-{num}"
    if platform == "reddit":
        return f"https://reddit.com/r/sports/comments/synthetic-{slug}-{num}"
    if platform == "instagram":
        return f"https://instagram.com/p/synthetic-{slug}-{num}"
    if platform == "facebook":
        return f"https://facebook.com/watch/?v=synthetic-{slug}-{num}"
    return f"https://x.com/sportswire/status/synthetic-{slug}-{num}"


def synthetic_record(index, platform, keyword, images_dir):
    fixtures = fixture_files()
    if not fixtures:
        raise FileNotFoundError("No fixture images available for synthetic fallback")

    source_fixture = fixtures[index % len(fixtures)]
    target_name = f"{platform}-synthetic-{index + 1:04d}{source_fixture.suffix.lower()}"
    target_path = images_dir / target_name
    shutil.copy2(source_fixture, target_path)

    return {
        "platform": platform,
        "keyword": keyword,
        "source_url": synthetic_source_url(platform, keyword, index),
        "image_url": f"synthetic://{target_name}",
        "source_type": "synthetic_fallback",
        "local_path": str(target_path),
        "download_status": "synthetic",
    }


def persist_records(records, output_dir, timeout, retry_count, retry_delay_ms, rate_limit_ms, allow_synthetic):
    output_dir.mkdir(parents=True, exist_ok=True)
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    state = {"last_request_at": None}

    stored = []
    for index, record in enumerate(records):
        record = dict(record)
        platform = record.get("platform") or "twitter"
        keyword = record.get("keyword") or "sports"
        image_url = record.get("image_url") or ""

        if image_url.startswith("synthetic://"):
            fallback = synthetic_record(index, platform, keyword, images_dir)
            fallback["source_url"] = record.get("source_url") or fallback["source_url"]
            stored.append(fallback)
            continue

        ext = guess_extension_from_url(image_url)
        digest = hashlib.sha1(image_url.encode("utf-8")).hexdigest()[:16]
        destination_path = images_dir / f"{digest}{ext}"

        try:
            if not destination_path.exists():
                download_image(
                    session,
                    image_url,
                    destination_path,
                    timeout,
                    retry_count,
                    retry_delay_ms,
                    rate_limit_ms,
                    state,
                )
            record["local_path"] = str(destination_path)
            record["download_status"] = "downloaded"
            stored.append(record)
        except Exception as exc:
            if not allow_synthetic:
                record["download_status"] = "failed"
                record["download_error"] = str(exc)
                continue

            fallback = synthetic_record(index, platform, keyword, images_dir)
            fallback["fallback_reason"] = str(exc)
            fallback["source_url"] = record.get("source_url") or fallback["source_url"]
            stored.append(fallback)

    return stored


def write_manifest(output_dir, payload):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dated_path = output_dir / f"crawl-{timestamp}.json"
    latest_path = output_dir / "latest.json"

    encoded = json.dumps(payload, indent=2)
    dated_path.write_text(encoded, encoding="utf-8")
    latest_path.write_text(encoded, encoding="utf-8")

    return {
        "dated_manifest": str(dated_path),
        "latest_manifest": str(latest_path),
    }


def collect_platform_live_records(platform, args):
    if args.no_live_fetch:
        return [], "live fetch disabled via --no-live-fetch"

    if platform == "twitter":
        return collect_live_twitter_records(
            keywords=args.keywords,
            limit=args.limit,
            timeout=args.timeout,
            retry_count=args.retry_count,
            retry_delay_ms=args.retry_delay_ms,
            rate_limit_ms=args.rate_limit_ms,
        )

    if platform == "youtube":
        return collect_live_youtube_records(
            keywords=args.keywords,
            limit=args.limit,
            timeout=args.timeout,
            retry_count=args.retry_count,
            retry_delay_ms=args.retry_delay_ms,
            rate_limit_ms=args.rate_limit_ms,
        )

    if platform == "reddit":
        return collect_live_reddit_records(
            keywords=args.keywords,
            limit=args.limit,
            timeout=args.timeout,
            retry_count=args.retry_count,
            retry_delay_ms=args.retry_delay_ms,
            rate_limit_ms=args.rate_limit_ms,
        )

    if platform in {"instagram", "facebook"}:
        return collect_meta_placeholder_records(platform)

    return [], f"platform '{platform}' not recognized"


def build_platform_items(platform, args, base_output_dir):
    collected, collection_note = collect_platform_live_records(platform, args)
    allow_synthetic = not args.no_synthetic_fallback

    while allow_synthetic and len(collected) < args.limit:
        keyword = args.keywords[len(collected) % len(args.keywords)]
        synthetic_index = len(collected)
        collected.append(
            {
                "platform": platform,
                "keyword": keyword,
                "source_url": synthetic_source_url(platform, keyword, synthetic_index),
                "image_url": f"synthetic://pending-{synthetic_index + 1}",
                "source_type": "synthetic_fallback",
            }
        )

    collected = collected[: args.limit]

    platform_output_dir = base_output_dir / platform
    stored_records = persist_records(
        records=collected,
        output_dir=platform_output_dir,
        timeout=args.timeout,
        retry_count=args.retry_count,
        retry_delay_ms=args.retry_delay_ms,
        rate_limit_ms=args.rate_limit_ms,
        allow_synthetic=allow_synthetic,
    )

    payload = {
        "platform": platform,
        "keywords": args.keywords,
        "limit": args.limit,
        "count": len(stored_records),
        "collected_at": utc_now_iso(),
        "collection_note": collection_note,
        "items": stored_records,
    }
    manifest_paths = write_manifest(platform_output_dir, payload)
    payload.update(manifest_paths)
    return payload


def crawl(args):
    if args.limit < 1 or args.limit > 500:
        raise ValueError("--limit must be between 1 and 500")

    base_output_dir = Path(args.output_dir).resolve()
    started_at = time.time()

    platforms = [args.platform] if args.platform != "all" else ["twitter", "instagram", "reddit", "facebook", "youtube"]

    platform_payloads = []
    all_items = []
    for platform in platforms:
        payload = build_platform_items(platform, args, base_output_dir)
        platform_payloads.append(payload)
        all_items.extend(payload.get("items", []))

    if args.platform == "all":
        merged_payload = {
            "platform": "all",
            "platforms": platforms,
            "keywords": args.keywords,
            "limit_per_platform": args.limit,
            "count": len(all_items),
            "collected_at": utc_now_iso(),
            "duration_ms": int((time.time() - started_at) * 1000),
            "items": all_items,
            "platform_results": [
                {
                    "platform": item.get("platform"),
                    "count": item.get("count"),
                    "collection_note": item.get("collection_note"),
                    "latest_manifest": item.get("latest_manifest"),
                }
                for item in platform_payloads
            ],
        }
        manifest_paths = write_manifest(base_output_dir, merged_payload)
        merged_payload.update(manifest_paths)
        return merged_payload

    payload = platform_payloads[0]
    payload["duration_ms"] = int((time.time() - started_at) * 1000)
    return payload


def main():
    args = build_parser().parse_args()
    try:
        payload = crawl(args)
        print(json.dumps(payload))
        return 0
    except Exception as exc:
        print(f"Crawler execution failed: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
