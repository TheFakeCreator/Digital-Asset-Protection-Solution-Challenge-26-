# Day 4 MVP Synthetic Detection Benchmark

Date: 2026-04-14
Owner: Team MVP Validation

## Command

Run from backend/python:

python mvp_detection_benchmark.py

Threshold sweep used for tuning:

python mvp_detection_benchmark.py --threshold 78
python mvp_detection_benchmark.py --threshold 80
python mvp_detection_benchmark.py --threshold 82
python mvp_detection_benchmark.py --threshold 84
python mvp_detection_benchmark.py --threshold 85
python mvp_detection_benchmark.py --threshold 86
python mvp_detection_benchmark.py --threshold 88
python mvp_detection_benchmark.py --threshold 90

Outputs:

- backend/data/benchmarks/mvp-detection/report.json
- backend/data/benchmarks/mvp-detection/report.md

## Summary Metrics

- Total positives: 66
- Total negatives: 66
- Positive recall: 87.88%
- Core recall (light and medium): 89.58%
- Hard recall (stress edits): 83.33%
- False positive rate: 0.0%
- Precision: 100.0%
- Accuracy: 93.94%

## MVP Gate Results

- Core recall (light+medium) >= 70%: PASS
- Light edit recall >= 85%: PASS
- Medium edit recall >= 50%: PASS
- False positive rate <= 15%: PASS
- Overall gate: PASS

## Notes

- The benchmark uses deterministic synthetic transformations: crop, text, overlay, blur, noise, brightness, contrast, compression, and rotation.
- Detection matcher now uses a crop-aware multi-hash strategy (phash, dhash, whash, ahash) for stronger resilience to compression and moderate crops.
- Threshold sweep shows strong operating range from 82-88 with 0.0% false positives; threshold 85 is retained as the default operating point.
- This benchmark is repeatable and suitable for demo-day validation without external platform dependencies.
