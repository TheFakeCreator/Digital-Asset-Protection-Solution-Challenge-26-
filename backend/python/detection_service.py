import argparse
import json
import os
import sys

from PIL import Image, ImageOps, UnidentifiedImageError
import imagehash

try:
    import cv2
    import numpy as np
except Exception:  # pragma: no cover - optional fallback
    cv2 = None
    np = None


ALGORITHM = "multihash-v2-hybrid"
DEFAULT_THRESHOLD = 85
DEFAULT_MIN_SIZE = 1
DEFAULT_CROP_FACTOR = 0.92
HASH_MIN_EDGE = 64
HASH_MAX_EDGE = 2048
GEOMETRIC_MIN_EDGE = 96
GEOMETRIC_MAX_EDGE = 1600
GEOMETRIC_MATCH_RATIO_SCALE = 8.0
GEOMETRIC_MIN_GOOD_MATCHES = 10
GEOMETRIC_MIN_INLIERS = 8
GEOMETRIC_RATIO_TEST = 0.8
GEOMETRIC_ROTATION_ANGLES = [0, -12, -9, -6, -3, 3, 6, 9, 12]
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
        help="Minimum edge hint in pixels for geometric normalization",
    )
    parser.add_argument("candidate_paths", nargs="+", help="Candidate image paths")
    return parser


def clamp_similarity(value):
    return max(0, min(100, int(round(value))))


def _pil_lanczos_filter():
    if hasattr(Image, "Resampling"):
        return Image.Resampling.LANCZOS
    return Image.LANCZOS


def resize_pil_by_limits(image, min_edge, max_edge):
    width, height = image.size
    if width < 1 or height < 1:
        return image

    scale = 1.0
    smallest_edge = min(width, height)
    largest_edge = max(width, height)

    if smallest_edge < min_edge:
        scale = min_edge / float(smallest_edge)

    if largest_edge * scale > max_edge:
        scale = max_edge / float(largest_edge)

    if abs(scale - 1.0) < 0.01:
        return image

    resized_width = max(1, int(round(width * scale)))
    resized_height = max(1, int(round(height * scale)))
    return image.resize((resized_width, resized_height), _pil_lanczos_filter())


def resize_gray_by_limits(image, min_edge, max_edge):
    if cv2 is None:
        return image

    height, width = image.shape[:2]
    if width < 1 or height < 1:
        return image

    scale = 1.0
    smallest_edge = min(width, height)
    largest_edge = max(width, height)

    if smallest_edge < min_edge:
        scale = min_edge / float(smallest_edge)

    if largest_edge * scale > max_edge:
        scale = max_edge / float(largest_edge)

    if abs(scale - 1.0) < 0.01:
        return image

    resized_width = max(1, int(round(width * scale)))
    resized_height = max(1, int(round(height * scale)))
    interpolation = cv2.INTER_CUBIC if scale > 1.0 else cv2.INTER_AREA
    return cv2.resize(image, (resized_width, resized_height), interpolation=interpolation)


def normalize_image(image):
    # Flatten alpha so transparent-pixel RGB noise does not distort perceptual hashes.
    prepared = ImageOps.exif_transpose(image).convert("RGBA")
    background = Image.new("RGBA", prepared.size, (255, 255, 255, 255))
    flattened = Image.alpha_composite(background, prepared).convert("RGB")
    normalized = ImageOps.autocontrast(flattened)
    return resize_pil_by_limits(normalized, HASH_MIN_EDGE, HASH_MAX_EDGE)


def build_variants(image):
    width, height = image.size

    crop_width = max(1, min(width, int(round(width * DEFAULT_CROP_FACTOR))))
    crop_height = max(1, min(height, int(round(height * DEFAULT_CROP_FACTOR))))
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


def compute_geometric_similarity(reference_path, candidate_path, min_size):
    if cv2 is None or np is None:
        return {
            "score": 0,
            "good_matches": 0,
            "inliers": 0,
            "status": "unavailable",
        }

    reference = cv2.imread(reference_path, cv2.IMREAD_GRAYSCALE)
    candidate_original = cv2.imread(candidate_path, cv2.IMREAD_GRAYSCALE)

    if reference is None or candidate_original is None:
        return {
            "score": 0,
            "good_matches": 0,
            "inliers": 0,
            "status": "decode_error",
        }

    reference = cv2.equalizeHist(reference)
    candidate_original = cv2.equalizeHist(candidate_original)

    target_min_edge = max(int(min_size or 1), GEOMETRIC_MIN_EDGE)
    reference = resize_gray_by_limits(reference, target_min_edge, GEOMETRIC_MAX_EDGE)
    candidate_original = resize_gray_by_limits(candidate_original, target_min_edge, GEOMETRIC_MAX_EDGE)

    orb = cv2.ORB_create(nfeatures=1800, fastThreshold=12)
    ref_keypoints, ref_descriptors = orb.detectAndCompute(reference, None)

    if ref_descriptors is None:
        return {
            "score": 0,
            "good_matches": 0,
            "inliers": 0,
            "status": "reference_no_descriptors",
        }

    if len(ref_keypoints) < GEOMETRIC_MIN_GOOD_MATCHES:
        return {
            "score": 0,
            "good_matches": 0,
            "inliers": 0,
            "status": "reference_insufficient_keypoints",
        }

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    best_result = {
        "score": 0,
        "good_matches": 0,
        "inliers": 0,
        "status": "no_descriptors",
    }

    height, width = candidate_original.shape

    for angle in GEOMETRIC_ROTATION_ANGLES:
        if angle == 0:
            candidate_view = candidate_original
        else:
            matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
            candidate_view = cv2.warpAffine(
                candidate_original,
                matrix,
                (width, height),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REFLECT,
            )

        cand_keypoints, cand_descriptors = orb.detectAndCompute(candidate_view, None)
        if cand_descriptors is None or len(cand_keypoints) < GEOMETRIC_MIN_GOOD_MATCHES:
            continue

        knn_matches = matcher.knnMatch(ref_descriptors, cand_descriptors, k=2)
        good_matches = []
        for pair in knn_matches:
            if len(pair) < 2:
                continue

            first, second = pair
            if first.distance < GEOMETRIC_RATIO_TEST * second.distance:
                good_matches.append(first)

        if len(good_matches) < GEOMETRIC_MIN_GOOD_MATCHES:
            continue

        source_points = np.float32([ref_keypoints[match.queryIdx].pt for match in good_matches]).reshape(-1, 1, 2)
        destination_points = np.float32([cand_keypoints[match.trainIdx].pt for match in good_matches]).reshape(-1, 1, 2)

        _homography, inlier_mask = cv2.findHomography(source_points, destination_points, cv2.RANSAC, 5.0)
        inliers = int(inlier_mask.sum()) if inlier_mask is not None else 0

        inlier_ratio = inliers / max(1, len(good_matches))
        match_ratio = len(good_matches) / max(1, min(len(ref_keypoints), len(cand_keypoints)))
        normalized_match_ratio = min(1.0, match_ratio * GEOMETRIC_MATCH_RATIO_SCALE)

        if inliers < GEOMETRIC_MIN_INLIERS:
            normalized_match_ratio *= 0.7

        score = (0.8 * normalized_match_ratio) + (0.2 * inlier_ratio)
        score_int = clamp_similarity(score * 100)

        if score_int > best_result["score"]:
            best_result = {
                "score": score_int,
                "good_matches": len(good_matches),
                "inliers": inliers,
                "status": "ok",
            }

    return best_result


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

        hash_score, matched_variant = similarity_score(reference["hashes"], candidate["hashes"])

        should_run_geometric = hash_score < threshold and hash_score >= max(25, threshold - 50)
        if should_run_geometric:
            geometric = compute_geometric_similarity(reference_path, candidate_path, min_size)
        else:
            geometric = {
                "score": 0,
                "good_matches": 0,
                "inliers": 0,
                "status": "skipped",
            }

        geometric_score = geometric["score"]

        final_score = max(hash_score, geometric_score)
        if geometric_score > hash_score:
            match_method = "geometric"
        elif hash_score > 0:
            match_method = "hash"
        else:
            match_method = "none"

        result.update(
            {
                "status": "ok",
                "similarity_score": final_score,
                "hash_similarity_score": hash_score,
                "geometric_similarity_score": geometric_score,
                "geometric_good_matches": geometric["good_matches"],
                "geometric_inliers": geometric["inliers"],
                "geometric_status": geometric["status"],
                "match_method": match_method,
                "is_match": final_score >= threshold,
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
