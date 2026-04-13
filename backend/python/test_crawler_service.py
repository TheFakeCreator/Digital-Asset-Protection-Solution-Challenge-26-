import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from crawler_service import crawl


class CrawlerServiceTests(unittest.TestCase):
    def test_offline_synthetic_crawl_generates_local_records(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "crawled" / "twitter"
            args = SimpleNamespace(
                platform="twitter",
                keywords=["sports", "athletic"],
                limit=20,
                timeout=10,
                retry_count=1,
                retry_delay_ms=100,
                rate_limit_ms=0,
                output_dir=str(output_dir),
                no_live_fetch=True,
                no_synthetic_fallback=False,
            )

            payload = crawl(args)

            self.assertEqual(payload["platform"], "twitter")
            self.assertEqual(payload["count"], 20)
            self.assertTrue((output_dir / "latest.json").exists())
            self.assertTrue((output_dir / "images").exists())

            for item in payload["items"]:
                self.assertIn("local_path", item)
                self.assertTrue(Path(item["local_path"]).exists())

    def test_manifest_structure_is_valid_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "crawled" / "twitter"
            args = SimpleNamespace(
                platform="twitter",
                keywords=["sports"],
                limit=5,
                timeout=10,
                retry_count=1,
                retry_delay_ms=100,
                rate_limit_ms=0,
                output_dir=str(output_dir),
                no_live_fetch=True,
                no_synthetic_fallback=False,
            )

            payload = crawl(args)
            latest_path = Path(payload["latest_manifest"])
            parsed = json.loads(latest_path.read_text(encoding="utf-8"))

            self.assertEqual(parsed["platform"], "twitter")
            self.assertEqual(parsed["count"], 5)
            self.assertIsInstance(parsed["items"], list)


if __name__ == "__main__":
    unittest.main()
