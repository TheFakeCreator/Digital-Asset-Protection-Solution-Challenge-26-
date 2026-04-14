# Fingerprinting and Detection Strategy (Day 4)

Date: 2026-04-14
Owner: Person 2 (Fingerprinting)

## Goals

- Keep asset fingerprinting deterministic and stable for registration workflows.
- Improve detection robustness for common real-world edits (compression, mild crop, overlay, blur).
- Maintain low false positives for MVP demonstration confidence.

## Asset Fingerprinting (Registration)

Registration uses `backend/python/fingerprint_service.py` with perceptual hash (`phash`).

Why this is used:

- Deterministic output for the same source image.
- Lightweight and fast for API upload workflows.
- Stable enough for canonical asset identity checks.

## Detection Matching (Search)

Detection search uses `backend/python/detection_service.py` with a crop-aware multi-hash profile:

- `phash` (weight 0.40)
- `dhash` (weight 0.25)
- `whash` (weight 0.20)
- `ahash` (weight 0.15)

Strategy details:

- Image is normalized with autocontrast before hashing.
- Variant crops are generated (`full`, `center`, and four corners).
- Similarity evaluates selected variant pairings and uses the best score.
- This improves resilience when a copied image is lightly cropped or re-encoded.

## Threshold Tuning Result

Tuning source: `backend/python/mvp_detection_benchmark.py` on synthetic positives and negatives.

Sweep summary:

- Threshold 78: recall 98.48, core 97.92, hard 100.0, FPR 0.0
- Threshold 80: recall 95.45, core 95.83, hard 94.44, FPR 0.0
- Threshold 82: recall 90.91, core 91.67, hard 88.89, FPR 0.0
- Threshold 84: recall 87.88, core 89.58, hard 83.33, FPR 0.0
- Threshold 85: recall 87.88, core 89.58, hard 83.33, FPR 0.0
- Threshold 86: recall 83.33, core 85.42, hard 77.78, FPR 0.0
- Threshold 88: recall 81.82, core 85.42, hard 72.22, FPR 0.0
- Threshold 90: recall 74.24, core 85.42, hard 44.44, FPR 0.0

Decision:

- Keep `DETECTION_SIMILARITY_THRESHOLD=85` as the default operating point.
- It preserves 0.0 false positive rate while retaining strong core recall.

## Known Limits

- Aggressive overlays and severe crop combinations can still reduce confidence.
- Future work can add geometric transforms and local feature matching to handle harder edits.
