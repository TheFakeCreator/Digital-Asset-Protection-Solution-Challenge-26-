import argparse
from pathlib import Path

from PIL import Image, ImageDraw


FIXTURE_SIZE = (320, 180)


def fixture_canvas(background):
    return Image.new("RGB", FIXTURE_SIZE, background)


def draw_fixture_01(path: Path):
    image = fixture_canvas("#101820")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 300, 160), outline="#f2aa4c", width=6)
    draw.ellipse((110, 35, 210, 145), outline="#f2aa4c", width=5)
    image.save(path)


def draw_fixture_02(path: Path):
    image = fixture_canvas("#1f2937")
    draw = ImageDraw.Draw(image)
    for x in range(15, 305, 30):
        draw.line((x, 15, x + 80, 165), fill="#22d3ee", width=4)
    image.save(path)


def draw_fixture_03(path: Path):
    image = fixture_canvas("#0f172a")
    draw = ImageDraw.Draw(image)
    draw.polygon([(25, 150), (95, 35), (165, 150)], outline="#f97316", fill="#fb923c")
    draw.polygon([(155, 150), (225, 35), (295, 150)], outline="#10b981", fill="#34d399")
    image.save(path)


def draw_fixture_04(path: Path):
    image = fixture_canvas("#faf5ff")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((25, 25, 295, 155), radius=24, outline="#7c3aed", width=5)
    draw.rectangle((55, 55, 265, 125), outline="#4c1d95", width=3)
    image.save(path)


def draw_fixture_05(path: Path):
    image = fixture_canvas("#fffbeb")
    draw = ImageDraw.Draw(image)
    draw.arc((25, 15, 295, 165), start=0, end=300, fill="#ea580c", width=6)
    draw.line((35, 145, 285, 35), fill="#b91c1c", width=5)
    image.save(path)


def draw_fixture_06(path: Path):
    image = fixture_canvas("#ecfeff")
    draw = ImageDraw.Draw(image)
    draw.ellipse((50, 30, 270, 150), outline="#0f766e", width=6)
    draw.ellipse((110, 65, 210, 115), fill="#14b8a6")
    image.save(path)


def build_parser():
    parser = argparse.ArgumentParser(description="Generate sample media fixtures for manual API testing")
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent.parent / "fixtures" / "images"),
        help="Output folder for generated fixture images",
    )
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    generators = [
        draw_fixture_01,
        draw_fixture_02,
        draw_fixture_03,
        draw_fixture_04,
        draw_fixture_05,
        draw_fixture_06,
    ]

    generated = []
    for index, generator in enumerate(generators, start=1):
        path = output_dir / f"fixture-{index:02d}.png"
        generator(path)
        generated.append(str(path))

    for item in generated:
        print(item)


if __name__ == "__main__":
    main()
