import argparse
import json
import os
import sys

from PIL import Image, ImageOps, UnidentifiedImageError
import imagehash


ALGORITHM = "multihash-v1"
DEFAULT_THRESHOLD = 85
DEFAULT_MIN_SIZE = 16
DEFAULT_CROP_FACTOR = 0.92
VARIANT_PAIRINGS = [
    ("full", "full"),
    ("full", "center"),
    ("center", "full"),
    ("center", "center"),
    ("top_left", "full"),
    ("top_right", "full"),
    ("bottom_left", "full"),
    ("bottom_right", "full"),
    ("full", "top_left"),
    ("full", "top_right"),
    ("full", "bottom_left"),
    ("full", "bottom_right"),
]
HASH_WEIGHTS = {
    "phash": 0.4,
    "dhash": 0.25,
    "whash": 0.2,
    "ahash": 0.15,
}


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


def normalize_image(image):
    return ImageOps.autocontrast(image.convert("RGB"))


def build_variants(image):
    width, height = image.size

    crop_width = max(2, int(width * DEFAULT_CROP_FACTOR))
    crop_height = max(2, int(height * DEFAULT_CROP_FACTOR))
    x_offset = max(0, width - crop_width)
    y_offset = max(0, height - crop_height)
    center_x = max(0, (width - crop_width) // 2)
    center_y = max(0, (height - crop_height) // 2)

    boxes = {
        "full": (0, 0, width, height),
        "center": (center_x, center_y, center_x + crop_width, center_y + crop_height),
        "top_left": (0, 0, crop_width, crop_height),
        "top_right": (x_offset, 0, x_offset + crop_width, crop_height),
        "bottom_left": (0, y_offset, crop_width, y_offset + crop_height),
        "bottom_right": (x_offset, y_offset, x_offset + crop_width, y_offset + crop_height),
    }

    variants = {}
    for name, box in boxes.items():
        left, top, right, bottom = box
        if right <= left or bottom <= top:
            continue
        variants[name] = image.crop((left, top, right, bottom))

    return variants


def compute_hash_bundle(image):
    return {
        "phash": str(imagehash.phash(image)),
        "dhash": str(imagehash.dhash(image)),
        "whash": str(imagehash.whash(image)),
        "ahash": str(imagehash.average_hash(image)),
    }


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

            normalized = normalize_image(image)
            variants = build_variants(normalized)
            hashes_by_variant = {
                variant_name: compute_hash_bundle(variant_image)
                for variant_name, variant_image in variants.items()
            }

            return {
                "status": "ok",
                "hashes": hashes_by_variant,
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


def algorithm_similarity(reference_hash, candidate_hash):
    hash_bits = len(reference_hash) * 4
    distance = imagehash.hex_to_hash(reference_hash) - imagehash.hex_to_hash(candidate_hash)
    similarity = (1 - (distance / hash_bits)) * 100
    return max(0.0, min(100.0, similarity))


def hash_bundle_similarity(reference_bundle, candidate_bundle):
    weighted_total = 0.0
    weights_used = 0.0

    for algorithm, weight in HASH_WEIGHTS.items():
        ref_value = reference_bundle.get(algorithm)
        cand_value = candidate_bundle.get(algorithm)
        if not ref_value or not cand_value:
            continue

        weighted_total += algorithm_similarity(ref_value, cand_value) * weight
        weights_used += weight

    if weights_used == 0:
        return 0.0

    return weighted_total / weights_used


def similarity_score(reference_hashes, candidate_hashes):
    best_score = 0.0
    best_pairing = "full:full"

    for reference_variant, candidate_variant in VARIANT_PAIRINGS:
        reference_bundle = reference_hashes.get(reference_variant)
        candidate_bundle = candidate_hashes.get(candidate_variant)
        if not reference_bundle or not candidate_bundle:
            continue

        score = hash_bundle_similarity(reference_bundle, candidate_bundle)
        if score > best_score:
            best_score = score
            best_pairing = f"{reference_variant}:{candidate_variant}"

    return clamp_similarity(best_score), best_pairing


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

        score, matched_variant = similarity_score(reference["hashes"], candidate["hashes"])
        result.update(
            {
                "status": "ok",
                "similarity_score": score,
                "is_match": score >= threshold,
                "match_variant": matched_variant,
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
            "variants": sorted(reference["hashes"].keys()),
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
