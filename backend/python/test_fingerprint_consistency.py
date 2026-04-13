import argparse
import json
import os
import sys

from PIL import Image
import imagehash


def build_parser():
    parser = argparse.ArgumentParser(description="Check perceptual hash consistency for an image")
    parser.add_argument("image_path", help="Path to the image to test")
    parser.add_argument("--runs", type=int, default=3, help="How many repeat runs to execute")
    return parser


def generate_hash(image_path):
    with Image.open(image_path) as image:
        return str(imagehash.phash(image))


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.runs < 2:
        print("--runs must be at least 2", file=sys.stderr)
        return 1

    if not os.path.isfile(args.image_path):
        print(f"Image not found: {args.image_path}", file=sys.stderr)
        return 1

    try:
        hashes = [generate_hash(args.image_path) for _ in range(args.runs)]
        distinct_hashes = sorted(set(hashes))
        consistent = len(distinct_hashes) == 1

        result = {
            "image_path": args.image_path,
            "algorithm": "phash",
            "runs": args.runs,
            "consistent": consistent,
            "hashes": hashes,
            "distinct_hashes": distinct_hashes,
        }

        print(json.dumps(result))

        if not consistent:
            print("Fingerprint consistency check failed", file=sys.stderr)
            return 1

        return 0
    except Exception as exc:
        print(f"Consistency check failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())