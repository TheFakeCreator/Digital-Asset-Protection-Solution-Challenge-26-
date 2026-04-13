import argparse
import json
import sys

from fingerprint_service import generate_fingerprint


def build_parser():
    parser = argparse.ArgumentParser(description="Generate perceptual hashes for multiple images")
    parser.add_argument("image_paths", nargs="+", help="Paths to input images")
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    try:
        results = [generate_fingerprint(image_path) for image_path in args.image_paths]
        payload = {
            "algorithm": "phash",
            "results": results,
            "count": len(results),
        }
        print(json.dumps(payload))
        return 0
    except Exception as exc:
        print(f"Batch fingerprint generation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())