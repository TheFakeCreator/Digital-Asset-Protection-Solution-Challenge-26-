import argparse
import hashlib
import json
import os
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse
from xml.etree import ElementTree

import requests


DEFAULT_KEYWORDS = [
    "sports",
    "athletic",
    "football",
    "basketball",
    "olympics",
]

NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
]

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
USER_AGENT = "Mozilla/5.0 (compatible; SolutionChallengeCrawler/1.0)"


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def safe_slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "item"


def build_parser():
    parser = argparse.ArgumentParser(description="Crawl sports-related media for platform monitoring")
    parser.add_argument("--platform", default="twitter", choices=["twitter"], help="Target platform")
    parser.add_argument("--keywords", nargs="+", default=DEFAULT_KEYWORDS, help="Search keywords")
    parser.add_argument("--limit", type=int, default=120, help="Number of records to store (1-500)")
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
        default=str(Path(__file__).resolve().parent.parent / "data" / "crawled" / "twitter"),
        help="Directory where crawl output and images are stored",
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


def request_with_retry(session, url, timeout, retry_count, retry_delay_ms, rate_limit_ms, state):
    last_error = None
    for attempt in range(retry_count + 1):
        wait_for_rate_limit(state, rate_limit_ms)
        try:
            response = session.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
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


def collect_live_twitter_records(keywords, limit, timeout, retry_count, retry_delay_ms, rate_limit_ms):
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

    return collected


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


def synthetic_record(index, keyword, images_dir):
    fixtures = fixture_files()
    if not fixtures:
        raise FileNotFoundError("No fixture images available for synthetic fallback")

    source_fixture = fixtures[index % len(fixtures)]
    target_name = f"synthetic-{index + 1:04d}{source_fixture.suffix.lower()}"
    target_path = images_dir / target_name
    shutil.copy2(source_fixture, target_path)

    source_slug = safe_slug(keyword)
    return {
        "platform": "twitter",
        "keyword": keyword,
        "source_url": f"https://x.com/sportswire/status/synthetic-{source_slug}-{index + 1}",
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
        image_url = record["image_url"]

        if image_url.startswith("synthetic://"):
            fallback = synthetic_record(index, record.get("keyword") or "sports", images_dir)
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

            fallback_keyword = record.get("keyword") or "sports"
            fallback = synthetic_record(index, fallback_keyword, images_dir)
            fallback["fallback_reason"] = str(exc)
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


def crawl(args):
    if args.limit < 1 or args.limit > 500:
        raise ValueError("--limit must be between 1 and 500")

    output_dir = Path(args.output_dir).resolve()
    started_at = time.time()
    collected = []

    if not args.no_live_fetch:
        collected = collect_live_twitter_records(
            keywords=args.keywords,
            limit=args.limit,
            timeout=args.timeout,
            retry_count=args.retry_count,
            retry_delay_ms=args.retry_delay_ms,
            rate_limit_ms=args.rate_limit_ms,
        )

    allow_synthetic = not args.no_synthetic_fallback

    while allow_synthetic and len(collected) < args.limit:
        keyword = args.keywords[len(collected) % len(args.keywords)]
        synthetic_index = len(collected)
        collected.append(
            {
                "platform": "twitter",
                "keyword": keyword,
                "source_url": f"https://x.com/sportswire/status/synthetic-{safe_slug(keyword)}-{synthetic_index + 1}",
                "image_url": f"synthetic://pending-{synthetic_index + 1}",
                "source_type": "synthetic_fallback",
            }
        )

    collected = collected[: args.limit]

    stored_records = persist_records(
        records=collected,
        output_dir=output_dir,
        timeout=args.timeout,
        retry_count=args.retry_count,
        retry_delay_ms=args.retry_delay_ms,
        rate_limit_ms=args.rate_limit_ms,
        allow_synthetic=allow_synthetic,
    )

    payload = {
        "platform": args.platform,
        "keywords": args.keywords,
        "limit": args.limit,
        "threshold_notes": "Synthetic fallback is used when live collection is unavailable or insufficient.",
        "count": len(stored_records),
        "collected_at": utc_now_iso(),
        "duration_ms": int((time.time() - started_at) * 1000),
        "items": stored_records,
    }

    manifest_paths = write_manifest(output_dir, payload)
    payload.update(manifest_paths)
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