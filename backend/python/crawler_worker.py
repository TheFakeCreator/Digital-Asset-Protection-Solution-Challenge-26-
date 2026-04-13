import argparse
import json
import time


def build_parser():
    parser = argparse.ArgumentParser(description="Crawler worker scaffold")
    parser.add_argument("--platform", required=True, help="Target platform name")
    parser.add_argument("--limit", type=int, default=20, help="Max results to collect")
    parser.add_argument("--timeout", type=int, default=30, help="Execution timeout in seconds")
    return parser


def main():
    args = build_parser().parse_args()
    started_at = time.time()

    # Placeholder implementation for Day 1.
    # Next step: platform-specific fetchers with retry/backoff.
    result = {
        "platform": args.platform,
        "status": "scaffold_ready",
        "items_collected": 0,
        "limit": args.limit,
        "timeout_seconds": args.timeout,
        "duration_ms": int((time.time() - started_at) * 1000)
    }

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
