import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from fingerprint_service import generate_fingerprint


def create_pattern_a(path: Path):
    image = Image.new("RGB", (128, 128), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((24, 24, 104, 104), outline="black", width=6)
    draw.line((24, 24, 104, 104), fill="black", width=4)
    draw.line((24, 104, 104, 24), fill="black", width=4)
    image.save(path)


def create_pattern_b(path: Path):
    image = Image.new("RGB", (128, 128), "black")
    draw = ImageDraw.Draw(image)
    draw.ellipse((18, 18, 110, 110), outline="white", width=8)
    draw.rectangle((48, 48, 80, 80), fill="white")
    image.save(path)


class FingerprintAccuracyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        self.image_a = self.root / "pattern-a.png"
        self.image_a_copy = self.root / "pattern-a-copy.png"
        self.image_b = self.root / "pattern-b.png"

        create_pattern_a(self.image_a)
        create_pattern_a(self.image_a_copy)
        create_pattern_b(self.image_b)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_same_image_content_has_same_hash(self):
        first = generate_fingerprint(str(self.image_a))["hash"]
        second = generate_fingerprint(str(self.image_a_copy))["hash"]

        self.assertEqual(first, second)

    def test_distinct_images_have_different_hashes(self):
        first = generate_fingerprint(str(self.image_a))["hash"]
        second = generate_fingerprint(str(self.image_b))["hash"]

        self.assertNotEqual(first, second)

    def test_batch_service_json_contract(self):
        script_path = Path(__file__).with_name("batch_fingerprint_service.py")
        completed = subprocess.run(
            [sys.executable, str(script_path), str(self.image_a), str(self.image_b)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, msg=completed.stderr)

        parsed = json.loads(completed.stdout)
        self.assertEqual(parsed["algorithm"], "phash")
        self.assertEqual(parsed["count"], 2)
        self.assertEqual(len(parsed["results"]), 2)

        for result in parsed["results"]:
            self.assertIn("input_path", result)
            self.assertIn("hash", result)
            self.assertEqual(result["algorithm"], "phash")


if __name__ == "__main__":
    unittest.main()