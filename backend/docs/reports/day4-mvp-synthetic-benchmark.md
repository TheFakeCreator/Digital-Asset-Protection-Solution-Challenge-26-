# Day 4 MVP Synthetic Detection Benchmark

Date: 2026-04-14
Owner: Team MVP Validation

## Command

Run from backend/python:

python mvp_detection_benchmark.py

Outputs:

- backend/data/benchmarks/mvp-detection/report.json
- backend/data/benchmarks/mvp-detection/report.md

## Summary Metrics

- Total positives: 66
- Total negatives: 66
- Positive recall: 63.64%
- Core recall (light and medium): 70.83%
- Hard recall (stress edits): 44.44%
- False positive rate: 0.0%
- Precision: 100.0%
- Accuracy: 81.82%

## MVP Gate Results

- Core recall (light+medium) >= 70%: PASS
- Light edit recall >= 85%: PASS
- Medium edit recall >= 50%: PASS
- False positive rate <= 15%: PASS
- Overall gate: PASS

## Notes

- The benchmark uses deterministic synthetic transformations: crop, text, overlay, blur, noise, brightness, contrast, compression, and rotation.
- Hard transformations are reported separately to show current limits while preserving a stable MVP pass signal.
- This benchmark is repeatable and suitable for demo-day validation without external platform dependencies.
