import unittest
from pathlib import Path

from robust_watermark import detect_fingerprint, generate_fingerprint


class RobustWatermarkModuleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = (
            Path(__file__).resolve().parent.parent / "fixtures" / "images" / "fixture-01.png"
        )
        if not cls.fixture.is_file():
            raise RuntimeError(f"Fixture image not found: {cls.fixture}")

    def test_generate_fingerprint_output_shape(self):
        result = generate_fingerprint(str(self.fixture))

        self.assertEqual(len(result["fingerprint_hex"]), 64)
        self.assertEqual(len(result["fingerprint_bits"]), 256)
        self.assertIn(len(result["ecc_bits"]), (512, 1024))
        self.assertEqual(result["frames_used"], 1)
        self.assertTrue(result["ecc_scheme"])

    def test_detect_fingerprint_output_schema(self):
        result = detect_fingerprint(str(self.fixture), key="demo-secret-key")

        self.assertIn("fingerprint", result)
        self.assertIn("confidence", result)
        self.assertIn("bit_error_rate", result)
        self.assertIn("frames_used", result)

        self.assertTrue(isinstance(result["fingerprint"], str))
        self.assertGreaterEqual(result["confidence"], 0.0)
        self.assertLessEqual(result["confidence"], 1.0)
        self.assertGreaterEqual(result["bit_error_rate"], 0.0)
        self.assertLessEqual(result["bit_error_rate"], 1.0)
        self.assertGreaterEqual(result["frames_used"], 1)


if __name__ == "__main__":
    unittest.main()
