import argparse
import io
import json
import random
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from detection_service import DEFAULT_MIN_SIZE, DEFAULT_THRESHOLD, compare_batch


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


@dataclass(frozen=True)
class TransformSpec:
    name: str
    severity: str
    apply: Callable[[Image.Image, random.Random], tuple[Image.Image, str, dict[str, Any]]]


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def safe_div(numerator, denominator):
    if denominator == 0:
        return 0.0
    return numerator / denominator


def as_pct(value):
    return round(value * 100, 2)


def open_rgb(image_path: Path):
    with Image.open(image_path) as image:
        return image.convert("RGB")


def save_image(path: Path, image: Image.Image, save_kwargs: dict[str, Any] | None = None):
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    params = dict(save_kwargs or {})

    if suffix in {".jpg", ".jpeg"}:
        image = image.convert("RGB")
        params.setdefault("quality", 55)
        params.setdefault("optimize", True)
        image.save(path, format="JPEG", **params)
        return

    params.setdefault("optimize", True)
    image.save(path, format="PNG", **params)


def transform_exact_copy(image: Image.Image, _rng: random.Random):
    return image.copy(), ".png", {}


def transform_resize_reencode(image: Image.Image, _rng: random.Random):
    width, height = image.size
    reduced = image.resize((max(32, int(width * 0.82)), max(32, int(height * 0.82))), Image.LANCZOS)
    restored = reduced.resize((width, height), Image.LANCZOS)
    return restored, ".jpg", {"quality": 45}


def transform_center_crop(image: Image.Image, _rng: random.Random):
    width, height = image.size
    left = int(width * 0.03)
    top = int(height * 0.03)
    right = int(width * 0.97)
    bottom = int(height * 0.97)
    cropped = image.crop((left, top, right, bottom)).resize((width, height), Image.LANCZOS)
    return cropped, ".png", {}


def transform_corner_crop(image: Image.Image, _rng: random.Random):
    width, height = image.size
    cropped = image.crop((0, 0, int(width * 0.95), int(height * 0.95))).resize((width, height), Image.LANCZOS)
    return cropped, ".png", {}


def transform_text_overlay(image: Image.Image, _rng: random.Random):
    rendered = image.copy()
    draw = ImageDraw.Draw(rendered)
    width, height = rendered.size
    block_width = max(80, width // 3)
    block_height = max(20, height // 9)
    draw.rectangle((8, 8, 8 + block_width, 8 + block_height), fill=(15, 23, 42))
    draw.text((14, 12), "LIVE", fill=(248, 250, 252))
    return rendered, ".png", {}


def transform_overlay_banner(image: Image.Image, _rng: random.Random):
    rgba = image.convert("RGBA")
    overlay = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    width, height = rgba.size
    bar_height = max(16, height // 10)
    draw.rectangle((0, height - bar_height, width, height), fill=(220, 38, 38, 80))
    draw.text((10, height - bar_height + 2), "CLIP", fill=(255, 255, 255, 220))
    merged = Image.alpha_composite(rgba, overlay).convert("RGB")
    return merged, ".png", {}


def transform_brightness_shift(image: Image.Image, _rng: random.Random):
    shifted = ImageEnhance.Brightness(image).enhance(1.1)
    return shifted, ".png", {}


def transform_contrast_shift(image: Image.Image, _rng: random.Random):
    shifted = ImageEnhance.Contrast(image).enhance(1.15)
    return shifted, ".png", {}


def transform_gaussian_blur(image: Image.Image, _rng: random.Random):
    blurred = image.filter(ImageFilter.GaussianBlur(radius=0.6))
    return blurred, ".png", {}


def transform_noise_blend(image: Image.Image, _rng: random.Random):
    noise = Image.effect_noise(image.size, 18).convert("L")
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    blended = Image.blend(image, noise_rgb, alpha=0.08)
    return blended, ".png", {}


def transform_rotate_small(image: Image.Image, _rng: random.Random):
    rotated = image.rotate(0.8, resample=Image.BICUBIC)
    return rotated, ".png", {}


TRANSFORMS = [
    TransformSpec("exact_copy", "light", transform_exact_copy),
    TransformSpec("resize_reencode", "light", transform_resize_reencode),
    TransformSpec("center_crop", "hard", transform_center_crop),
    TransformSpec("corner_crop", "hard", transform_corner_crop),
    TransformSpec("text_overlay", "medium", transform_text_overlay),
    TransformSpec("overlay_banner", "medium", transform_overlay_banner),
    TransformSpec("brightness_shift", "light", transform_brightness_shift),
    TransformSpec("contrast_shift", "light", transform_contrast_shift),
    TransformSpec("gaussian_blur", "medium", transform_gaussian_blur),
    TransformSpec("noise_blend", "medium", transform_noise_blend),
    TransformSpec("rotate_small", "hard", transform_rotate_small),
]


def build_parser():
    parser = argparse.ArgumentParser(description="Run MVP synthetic benchmark for image detection")
    parser.add_argument(
        "--fixtures-dir",
        default=str(Path(__file__).resolve().parent.parent / "fixtures" / "images"),
        help="Input fixtures directory",
    )
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent.parent / "data" / "benchmarks" / "mvp-detection"),
        help="Output directory for generated benchmark assets and reports",
    )
    parser.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD, help="Detection threshold (0-100)")
    parser.add_argument(
        "--min-size",
        type=int,
        default=DEFAULT_MIN_SIZE,
        help="Minimum edge hint in pixels for geometric normalization",
    )
    parser.add_argument("--max-assets", type=int, default=6, help="Maximum fixture assets to benchmark")
    parser.add_argument(
        "--synthetic-negatives",
        type=int,
        default=6,
        help="Synthetic negative images to generate for each run",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic generation")
    parser.add_argument("--report-json", default="", help="Optional custom report JSON path")
    parser.add_argument("--report-markdown", default="", help="Optional custom report markdown path")
    parser.add_argument(
        "--keep-output",
        action="store_true",
        help="Do not delete previous output directory before generation",
    )
    parser.add_argument(
        "--fail-on-thresholds",
        action="store_true",
        help="Exit with status 1 if benchmark does not meet recommended thresholds",
    )
    return parser


def validate_args(args):
    if args.threshold < 0 or args.threshold > 100:
        raise ValueError("--threshold must be between 0 and 100")
    if args.min_size < 1:
        raise ValueError("--min-size must be at least 1")
    if args.max_assets < 1:
        raise ValueError("--max-assets must be at least 1")
    if args.synthetic_negatives < 0:
        raise ValueError("--synthetic-negatives cannot be negative")


def discover_fixtures(fixtures_dir: Path, max_assets: int):
    if not fixtures_dir.exists():
        raise FileNotFoundError(f"Fixtures directory not found: {fixtures_dir}")

    files = [
        file_path
        for file_path in sorted(fixtures_dir.iterdir())
        if file_path.is_file() and file_path.suffix.lower() in IMAGE_EXTENSIONS
    ]

    if len(files) < 2:
        raise ValueError("At least 2 fixture images are required")

    return files[:max_assets]


def prepare_output_directory(output_dir: Path, keep_output: bool):
    if output_dir.exists() and not keep_output:
        shutil.rmtree(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)
    references_dir = output_dir / "references"
    candidates_dir = output_dir / "candidates"
    negatives_dir = output_dir / "negatives"

    references_dir.mkdir(parents=True, exist_ok=True)
    candidates_dir.mkdir(parents=True, exist_ok=True)
    negatives_dir.mkdir(parents=True, exist_ok=True)

    return references_dir, candidates_dir, negatives_dir


def stage_references(fixtures: list[Path], references_dir: Path):
    staged = []
    for fixture_path in fixtures:
        target = references_dir / fixture_path.name
        shutil.copy2(fixture_path, target)
        staged.append(target)
    return staged


def generate_positive_candidates(reference_path: Path, candidates_root: Path, rng: random.Random):
    image = open_rgb(reference_path)
    asset_dir = candidates_root / reference_path.stem
    asset_dir.mkdir(parents=True, exist_ok=True)

    candidates = []
    for index, transform in enumerate(TRANSFORMS, start=1):
        transformed, suffix, save_kwargs = transform.apply(image.copy(), rng)
        output_path = asset_dir / f"{index:02d}-{transform.name}{suffix}"
        save_image(output_path, transformed, save_kwargs)

        candidates.append(
            {
                "candidate_path": str(output_path),
                "expected_match": True,
                "transform": transform.name,
                "severity": transform.severity,
                "candidate_type": "positive",
            }
        )

    return candidates


def generate_synthetic_negative_image(path: Path, size: tuple[int, int], rng: random.Random):
    width, height = size
    image = Image.new(
        "RGB",
        size,
        (rng.randint(0, 50), rng.randint(0, 50), rng.randint(0, 50)),
    )
    draw = ImageDraw.Draw(image)

    for _ in range(12):
        x1 = rng.randint(0, max(1, width - 1))
        y1 = rng.randint(0, max(1, height - 1))
        x2 = rng.randint(0, max(1, width - 1))
        y2 = rng.randint(0, max(1, height - 1))
        color = (rng.randint(120, 255), rng.randint(120, 255), rng.randint(120, 255))
        line_width = rng.randint(1, 6)
        draw.line((x1, y1, x2, y2), fill=color, width=line_width)

    for _ in range(5):
        radius = rng.randint(12, max(13, min(width, height) // 5))
        x = rng.randint(radius, max(radius, width - radius))
        y = rng.randint(radius, max(radius, height - radius))
        color = (
            rng.randint(80, 255),
            rng.randint(80, 255),
            rng.randint(80, 255),
        )
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=color, width=3)

    save_image(path, image)


def build_negative_pool(staged_references: list[Path], negatives_dir: Path, synthetic_count: int, rng: random.Random):
    negatives = []
    fixture_negatives_dir = negatives_dir / "fixtures"
    fixture_negatives_dir.mkdir(parents=True, exist_ok=True)

    for reference_path in staged_references:
        target = fixture_negatives_dir / f"neg-{reference_path.name}"
        shutil.copy2(reference_path, target)
        negatives.append(
            {
                "candidate_path": str(target),
                "expected_match": False,
                "transform": "negative_fixture",
                "severity": "negative",
                "candidate_type": "negative",
                "source_fixture": reference_path.name,
            }
        )

    if synthetic_count > 0:
        base_size = open_rgb(staged_references[0]).size
        synthetic_dir = negatives_dir / "synthetic"
        synthetic_dir.mkdir(parents=True, exist_ok=True)

        for index in range(synthetic_count):
            path = synthetic_dir / f"negative-synthetic-{index + 1:02d}.png"
            generate_synthetic_negative_image(path, base_size, rng)
            negatives.append(
                {
                    "candidate_path": str(path),
                    "expected_match": False,
                    "transform": "negative_synthetic",
                    "severity": "negative",
                    "candidate_type": "negative",
                    "source_fixture": "",
                }
            )

    return negatives


def evaluate_reference(reference_path: Path, candidate_meta: list[dict[str, Any]], threshold: int, min_size: int):
    candidate_paths = [item["candidate_path"] for item in candidate_meta]
    payload = compare_batch(
        reference_path=str(reference_path),
        candidate_paths=candidate_paths,
        threshold=threshold,
        min_size=min_size,
    )

    records = []
    for meta, result in zip(candidate_meta, payload["results"]):
        predicted_match = bool(result.get("is_match", False))
        expected_match = bool(meta["expected_match"])

        if expected_match and predicted_match:
            outcome = "true_positive"
        elif expected_match and not predicted_match:
            outcome = "false_negative"
        elif not expected_match and predicted_match:
            outcome = "false_positive"
        else:
            outcome = "true_negative"

        records.append(
            {
                "reference": reference_path.name,
                "candidate_path": meta["candidate_path"],
                "candidate_type": meta["candidate_type"],
                "transform": meta["transform"],
                "severity": meta["severity"],
                "expected_match": expected_match,
                "predicted_match": predicted_match,
                "similarity_score": result.get("similarity_score", 0),
                "status": result.get("status", "error"),
                "error_code": result.get("error_code", ""),
                "error": result.get("error", ""),
                "outcome": outcome,
            }
        )

    return records


def compute_metrics(records: list[dict[str, Any]]):
    positives = [record for record in records if record["expected_match"]]
    negatives = [record for record in records if not record["expected_match"]]
    core_positives = [record for record in positives if record["severity"] in {"light", "medium"}]

    true_positives = sum(1 for record in positives if record["predicted_match"])
    core_true_positives = sum(1 for record in core_positives if record["predicted_match"])
    false_negatives = len(positives) - true_positives
    false_positives = sum(1 for record in negatives if record["predicted_match"])
    true_negatives = len(negatives) - false_positives

    recall = safe_div(true_positives, len(positives))
    core_recall = safe_div(core_true_positives, len(core_positives))
    false_positive_rate = safe_div(false_positives, len(negatives))
    precision = safe_div(true_positives, true_positives + false_positives)
    accuracy = safe_div(true_positives + true_negatives, len(records))

    by_transform = defaultdict(lambda: {"total": 0, "detected": 0, "severity": "medium"})
    by_severity = defaultdict(lambda: {"total": 0, "detected": 0})
    by_asset = defaultdict(
        lambda: {
            "positives": 0,
            "positives_detected": 0,
            "negatives": 0,
            "false_positives": 0,
        }
    )
    status_counts = defaultdict(int)

    for record in records:
        status_counts[record["status"]] += 1

        asset = by_asset[record["reference"]]
        if record["expected_match"]:
            asset["positives"] += 1
            if record["predicted_match"]:
                asset["positives_detected"] += 1

            transform_stats = by_transform[record["transform"]]
            transform_stats["total"] += 1
            transform_stats["severity"] = record["severity"]
            if record["predicted_match"]:
                transform_stats["detected"] += 1

            severity_stats = by_severity[record["severity"]]
            severity_stats["total"] += 1
            if record["predicted_match"]:
                severity_stats["detected"] += 1
        else:
            asset["negatives"] += 1
            if record["predicted_match"]:
                asset["false_positives"] += 1

    per_transform = []
    for transform_name, stats in sorted(by_transform.items()):
        transform_recall = safe_div(stats["detected"], stats["total"])
        per_transform.append(
            {
                "transform": transform_name,
                "severity": stats["severity"],
                "total": stats["total"],
                "detected": stats["detected"],
                "recall": round(transform_recall, 4),
                "recall_pct": as_pct(transform_recall),
            }
        )

    per_severity = []
    for severity, stats in sorted(by_severity.items()):
        severity_recall = safe_div(stats["detected"], stats["total"])
        per_severity.append(
            {
                "severity": severity,
                "total": stats["total"],
                "detected": stats["detected"],
                "recall": round(severity_recall, 4),
                "recall_pct": as_pct(severity_recall),
            }
        )

    per_asset = []
    for asset_name, stats in sorted(by_asset.items()):
        asset_recall = safe_div(stats["positives_detected"], stats["positives"])
        asset_fpr = safe_div(stats["false_positives"], stats["negatives"])
        per_asset.append(
            {
                "asset": asset_name,
                "positives": stats["positives"],
                "positives_detected": stats["positives_detected"],
                "positive_recall": round(asset_recall, 4),
                "positive_recall_pct": as_pct(asset_recall),
                "negatives": stats["negatives"],
                "false_positives": stats["false_positives"],
                "false_positive_rate": round(asset_fpr, 4),
                "false_positive_rate_pct": as_pct(asset_fpr),
            }
        )

    severity_lookup = {item["severity"]: item for item in per_severity}
    light_recall = severity_lookup.get("light", {}).get("recall", 0.0)
    medium_recall = severity_lookup.get("medium", {}).get("recall", 0.0)
    hard_recall = severity_lookup.get("hard", {}).get("recall", 0.0)

    pass_criteria = {
        "core_recall_min": 0.7,
        "light_recall_min": 0.85,
        "medium_recall_min": 0.5,
        "max_false_positive_rate": 0.15,
        "passes_core_recall": core_recall >= 0.7,
        "passes_light_recall": light_recall >= 0.85,
        "passes_medium_recall": medium_recall >= 0.5,
        "passes_false_positive_rate": false_positive_rate <= 0.15,
    }
    pass_criteria["passes_all"] = all(
        [
            pass_criteria["passes_core_recall"],
            pass_criteria["passes_light_recall"],
            pass_criteria["passes_medium_recall"],
            pass_criteria["passes_false_positive_rate"],
        ]
    )

    return {
        "total_records": len(records),
        "total_positives": len(positives),
        "total_negatives": len(negatives),
        "true_positives": true_positives,
        "false_negatives": false_negatives,
        "false_positives": false_positives,
        "true_negatives": true_negatives,
        "recall": round(recall, 4),
        "recall_pct": as_pct(recall),
        "false_positive_rate": round(false_positive_rate, 4),
        "false_positive_rate_pct": as_pct(false_positive_rate),
        "core_recall": round(core_recall, 4),
        "core_recall_pct": as_pct(core_recall),
        "hard_recall": round(hard_recall, 4),
        "hard_recall_pct": as_pct(hard_recall),
        "precision": round(precision, 4),
        "precision_pct": as_pct(precision),
        "accuracy": round(accuracy, 4),
        "accuracy_pct": as_pct(accuracy),
        "status_counts": dict(status_counts),
        "per_transform": per_transform,
        "per_severity": per_severity,
        "per_asset": per_asset,
        "pass_criteria": pass_criteria,
    }


def render_markdown_report(payload: dict[str, Any]):
    metrics = payload["metrics"]
    pass_criteria = metrics["pass_criteria"]
    lines = [
        "# MVP Synthetic Detection Benchmark",
        "",
        f"Generated at: {payload['generated_at']}",
        f"Fixtures used: {payload['config']['assets_evaluated']}",
        f"Threshold: {payload['config']['threshold']}",
        "",
        "## Summary Metrics",
        "",
        f"- Total positives: {metrics['total_positives']}",
        f"- Total negatives: {metrics['total_negatives']}",
        f"- Positive recall: {metrics['recall_pct']}%",
        f"- Core recall (light+medium): {metrics['core_recall_pct']}%",
        f"- Hard recall (stress edits): {metrics['hard_recall_pct']}%",
        f"- False positive rate: {metrics['false_positive_rate_pct']}%",
        f"- Precision: {metrics['precision_pct']}%",
        f"- Accuracy: {metrics['accuracy_pct']}%",
        "",
        "## MVP Gates",
        "",
        f"- Core recall (light+medium) >= 70%: {'PASS' if pass_criteria['passes_core_recall'] else 'FAIL'}",
        f"- Light edit recall >= 85%: {'PASS' if pass_criteria['passes_light_recall'] else 'FAIL'}",
        f"- Medium edit recall >= 50%: {'PASS' if pass_criteria['passes_medium_recall'] else 'FAIL'}",
        f"- False positive rate <= 15%: {'PASS' if pass_criteria['passes_false_positive_rate'] else 'FAIL'}",
        f"- Overall gate: {'PASS' if pass_criteria['passes_all'] else 'FAIL'}",
        "",
        "## Transform Breakdown",
        "",
        "| Transform | Severity | Total | Detected | Recall |",
        "| --- | --- | ---: | ---: | ---: |",
    ]

    for item in metrics["per_transform"]:
        lines.append(
            f"| {item['transform']} | {item['severity']} | {item['total']} | {item['detected']} | {item['recall_pct']}% |"
        )

    lines.extend(
        [
            "",
            "## Severity Breakdown",
            "",
            "| Severity | Total | Detected | Recall |",
            "| --- | ---: | ---: | ---: |",
        ]
    )

    for item in metrics["per_severity"]:
        lines.append(
            f"| {item['severity']} | {item['total']} | {item['detected']} | {item['recall_pct']}% |"
        )

    lines.extend(
        [
            "",
            "## Per Asset",
            "",
            "| Asset | Positives | Positives Detected | Recall | Negatives | False Positives | FPR |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )

    for item in metrics["per_asset"]:
        lines.append(
            "| "
            f"{item['asset']} | {item['positives']} | {item['positives_detected']} | "
            f"{item['positive_recall_pct']}% | {item['negatives']} | {item['false_positives']} | "
            f"{item['false_positive_rate_pct']}% |"
        )

    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Positive candidates are generated through deterministic image edits (crop, overlay, text, blur, noise, brightness, contrast, compression, rotation).",
            "- Negative candidates include other fixture originals plus synthetic abstract images.",
            "- This benchmark is intended for repeatable MVP demonstration readiness.",
        ]
    )

    return "\n".join(lines)


def run_benchmark(args):
    validate_args(args)

    fixtures_dir = Path(args.fixtures_dir).resolve()
    output_dir = Path(args.output_dir).resolve()

    fixtures = discover_fixtures(fixtures_dir, args.max_assets)
    references_dir, candidates_dir, negatives_dir = prepare_output_directory(output_dir, args.keep_output)
    staged_references = stage_references(fixtures, references_dir)

    rng = random.Random(args.seed)
    negative_pool = build_negative_pool(staged_references, negatives_dir, args.synthetic_negatives, rng)

    all_records = []
    for reference_path in staged_references:
        positives = generate_positive_candidates(reference_path, candidates_dir, rng)
        negatives = [
            item
            for item in negative_pool
            if item.get("source_fixture", "") != reference_path.name
        ]
        all_records.extend(
            evaluate_reference(
                reference_path=reference_path,
                candidate_meta=[*positives, *negatives],
                threshold=args.threshold,
                min_size=args.min_size,
            )
        )

    metrics = compute_metrics(all_records)

    json_report_path = Path(args.report_json).resolve() if args.report_json else output_dir / "report.json"
    markdown_report_path = (
        Path(args.report_markdown).resolve() if args.report_markdown else output_dir / "report.md"
    )

    payload = {
        "generated_at": utc_now_iso(),
        "config": {
            "fixtures_dir": str(fixtures_dir),
            "output_dir": str(output_dir),
            "threshold": args.threshold,
            "min_size": args.min_size,
            "max_assets": args.max_assets,
            "synthetic_negatives": args.synthetic_negatives,
            "seed": args.seed,
            "assets_evaluated": len(staged_references),
            "transforms_per_asset": len(TRANSFORMS),
        },
        "assets": [path.name for path in staged_references],
        "metrics": metrics,
        "results": all_records,
        "reports": {
            "json": str(json_report_path),
            "markdown": str(markdown_report_path),
        },
    }

    json_report_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_report_path.parent.mkdir(parents=True, exist_ok=True)
    json_report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    markdown_report_path.write_text(render_markdown_report(payload), encoding="utf-8")

    return payload


def main():
    parser = build_parser()
    args = parser.parse_args()

    try:
        payload = run_benchmark(args)
        print(json.dumps(payload))

        if args.fail_on_thresholds and not payload["metrics"]["pass_criteria"]["passes_all"]:
            return 1

        return 0
    except Exception as exc:
        print(f"MVP benchmark failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())