import argparse
import json
import os
import sys

from PIL import Image
import imagehash


ALGORITHM = "phash"


def build_parser():
    parser = argparse.ArgumentParser(description="Generate perceptual hash fingerprint")
    parser.add_argument("image_path", help="Path to the input image")
    return parser


def generate_fingerprint(image_path):
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    with Image.open(image_path) as image:
        fingerprint_hash = str(imagehash.phash(image))

    return {
        "hash": fingerprint_hash,
        "algorithm": ALGORITHM,
        "input_path": image_path,
    }


def main():
    parser = build_parser()
    args = parser.parse_args()

    try:
        result = generate_fingerprint(args.image_path)
        print(json.dumps(result))
        return 0
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Fingerprint generation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
