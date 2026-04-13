import argparse
import json
import os
import sys

from PIL import Image, UnidentifiedImageError
import imagehash


ALGORITHM = "phash"
PHASH_BITS = 64
DEFAULT_THRESHOLD = 85
DEFAULT_MIN_SIZE = 16


def build_parser():
    parser = argparse.ArgumentParser(description="Compare an asset fingerprint against candidate images")
    parser.add_argument("--reference", required=True, help="Path to reference asset image")
    parser.add_argument(
        "--threshold",
        type=int,
        default=DEFAULT_THRESHOLD,
        help="Similarity threshold for a match (0-100)",
    )
    parser.add_argument(
        "--min-size",
        type=int,
        default=DEFAULT_MIN_SIZE,
        help="Minimum width and height in pixels",
    )
    parser.add_argument("candidate_paths", nargs="+", help="Candidate image paths")
    return parser


def clamp_similarity(value):
    return max(0, min(100, int(round(value))))


def compute_image_hash(image_path, min_size):
    if not os.path.isfile(image_path):
        return {
            "status": "error",
            "error_code": "FILE_NOT_FOUND",
            "error": f"File not found: {image_path}",
        }

    try:
        with Image.open(image_path) as image:
            width, height = image.size
            if width < min_size or height < min_size:
                return {
                    "status": "skipped",
                    "error_code": "IMAGE_TOO_SMALL",
                    "error": f"Image is too small: {width}x{height} (min {min_size}x{min_size})",
                    "width": width,
                    "height": height,
                }

            return {
                "status": "ok",
                "hash": str(imagehash.phash(image)),
                "width": width,
                "height": height,
            }
    except UnidentifiedImageError:
        return {
            "status": "error",
            "error_code": "CORRUPTED_IMAGE",
            "error": f"Image cannot be decoded: {image_path}",
        }
    except Exception as exc:
        return {
            "status": "error",
            "error_code": "IMAGE_READ_ERROR",
            "error": f"Failed to read image {image_path}: {exc}",
        }


def similarity_score(reference_hash, candidate_hash):
    distance = imagehash.hex_to_hash(reference_hash) - imagehash.hex_to_hash(candidate_hash)
    similarity = (1 - (distance / PHASH_BITS)) * 100
    return clamp_similarity(similarity)


def compare_batch(reference_path, candidate_paths, threshold, min_size):
    reference = compute_image_hash(reference_path, min_size)
    if reference["status"] != "ok":
        raise ValueError(reference["error"])

    results = []
    for candidate_path in candidate_paths:
        candidate = compute_image_hash(candidate_path, min_size)
        result = {
            "image_path": candidate_path,
            "algorithm": ALGORITHM,
        }

        if candidate["status"] != "ok":
            result.update(
                {
                    "status": candidate["status"],
                    "is_match": False,
                    "similarity_score": 0,
                    "error_code": candidate["error_code"],
                    "error": candidate["error"],
                }
            )
            results.append(result)
            continue

        score = similarity_score(reference["hash"], candidate["hash"])
        result.update(
            {
                "status": "ok",
                "similarity_score": score,
                "is_match": score >= threshold,
                "width": candidate["width"],
                "height": candidate["height"],
            }
        )
        results.append(result)

    return {
        "algorithm": ALGORITHM,
        "threshold": threshold,
        "reference": {
            "image_path": reference_path,
            "hash": reference["hash"],
            "width": reference["width"],
            "height": reference["height"],
        },
        "results": results,
        "count": len(results),
    }


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.threshold < 0 or args.threshold > 100:
        print("--threshold must be between 0 and 100", file=sys.stderr)
        return 1

    if args.min_size < 1:
        print("--min-size must be at least 1", file=sys.stderr)
        return 1

    try:
        payload = compare_batch(
            reference_path=args.reference,
            candidate_paths=args.candidate_paths,
            threshold=args.threshold,
            min_size=args.min_size,
        )
        print(json.dumps(payload))
        return 0
    except Exception as exc:
        print(f"Detection comparison failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
