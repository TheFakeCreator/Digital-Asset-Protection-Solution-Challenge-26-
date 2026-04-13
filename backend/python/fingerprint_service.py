import argparse
import json
import os
import sys

from PIL import Image
import imagehash


def build_parser():
    parser = argparse.ArgumentParser(description="Generate perceptual hash fingerprint")
    parser.add_argument("image_path", help="Path to the input image")
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not os.path.isfile(args.image_path):
        print(f"Image not found: {args.image_path}", file=sys.stderr)
        return 1

    try:
        with Image.open(args.image_path) as image:
            fingerprint_hash = str(imagehash.phash(image))

        result = {
            "hash": fingerprint_hash,
            "algorithm": "phash",
            "input_path": args.image_path
        }
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(f"Fingerprint generation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
