import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


def create_reference(path: Path):
    image = Image.new("RGB", (160, 160), "#1f2937")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 140, 140), outline="#eab308", width=6)
    draw.line((20, 20, 140, 140), fill="#eab308", width=4)
    draw.line((20, 140, 140, 20), fill="#eab308", width=4)
    image.save(path)


def create_different(path: Path):
    image = Image.new("RGB", (160, 160), "#020617")
    draw = ImageDraw.Draw(image)
    draw.ellipse((30, 30, 130, 130), outline="#22d3ee", width=8)
    draw.rectangle((60, 60, 100, 100), fill="#0ea5e9")
    image.save(path)


class DetectionServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        self.reference = self.root / "reference.png"
        self.same_copy = self.root / "same-copy.png"
        self.different = self.root / "different.png"
        self.too_small = self.root / "too-small.png"
        self.corrupted = self.root / "corrupted.png"

        create_reference(self.reference)
        create_reference(self.same_copy)
        create_different(self.different)
        Image.new("RGB", (8, 8), "white").save(self.too_small)
        self.corrupted.write_bytes(b"not-an-image")

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_service(self, *candidate_paths):
        script = Path(__file__).with_name("detection_service.py")
        completed = subprocess.run(
            [
                sys.executable,
                str(script),
                "--reference",
                str(self.reference),
                "--threshold",
                "85",
                *[str(path) for path in candidate_paths],
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, msg=completed.stderr)
        return json.loads(completed.stdout)

    def test_batch_matching_and_score_generation(self):
        payload = self.run_service(self.same_copy, self.different)

        self.assertEqual(payload["algorithm"], "multihash-v2-hybrid")
        self.assertEqual(payload["count"], 2)

        first = payload["results"][0]
        second = payload["results"][1]

        self.assertEqual(first["status"], "ok")
        self.assertTrue(first["is_match"])
        self.assertGreaterEqual(first["similarity_score"], 85)

        self.assertEqual(second["status"], "ok")
        self.assertLessEqual(second["similarity_score"], 100)

    def test_tiny_and_corrupted_images_are_handled(self):
        payload = self.run_service(self.too_small, self.corrupted)

        small_result = payload["results"][0]
        corrupted_result = payload["results"][1]

        self.assertEqual(small_result["status"], "ok")
        self.assertIn("similarity_score", small_result)
        self.assertGreaterEqual(small_result["similarity_score"], 0)
        self.assertLessEqual(small_result["similarity_score"], 100)

        self.assertEqual(corrupted_result["status"], "error")
        self.assertEqual(corrupted_result["error_code"], "CORRUPTED_IMAGE")


if __name__ == "__main__":
    unittest.main()
