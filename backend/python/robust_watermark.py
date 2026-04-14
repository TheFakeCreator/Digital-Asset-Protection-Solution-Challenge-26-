import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from typing import Iterable

import cv2
import numpy as np
from scipy.fftpack import dct as scipy_dct

try:
    from reedsolo import RSCodec, ReedSolomonError
except Exception:  # pragma: no cover - optional dependency fallback
    RSCodec = None
    ReedSolomonError = Exception


FIXED_SIZE = (256, 256)
BLOCK_SIZE = 8
HASH_BITS = 256
DEFAULT_PARITY_BYTES = 32
DEFAULT_FRAME_SAMPLE_SECONDS = 1.0
DEFAULT_MAX_FRAMES = 120
DEFAULT_REPETITIONS = 6
DEFAULT_KEY = "hash-lab-demo-key"
DEFAULT_CROP_FACTOR = 0.9
MID_FREQUENCY_COORDS = [
    (1, 2),
    (2, 1),
    (2, 2),
    (1, 3),
    (3, 1),
    (2, 3),
    (3, 2),
    (1, 4),
    (4, 1),
]
ROTATIONS = [0, 90, 180, 270]
VIDEO_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".webm",
    ".mpeg",
    ".mpg",
    ".m4v",
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _sha256_bytes(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def _bytes_to_bits(data: bytes) -> np.ndarray:
    return np.unpackbits(np.frombuffer(data, dtype=np.uint8))


def _bits_to_bytes(bits: np.ndarray) -> bytes:
    packed = np.packbits(bits.astype(np.uint8))
    return packed.tobytes()


def _seed_from_key(key: str, *parts: object) -> int:
    joined = "|".join([key, *[str(part) for part in parts]])
    digest = hashlib.sha256(joined.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=False)


@dataclass
class _DecodedBits:
    bits: np.ndarray
    success: bool
    reencoded_bits: np.ndarray


class _ECCCodec:
    """ECC wrapper using Reed-Solomon when available, fallback repetition coding otherwise."""

    def __init__(self, parity_bytes: int = DEFAULT_PARITY_BYTES):
        self.parity_bytes = parity_bytes
        self.message_bytes = HASH_BITS // 8
        self._use_rs = RSCodec is not None and parity_bytes > 0
        self._rs_codec = RSCodec(parity_bytes) if self._use_rs else None
        self._repeat_factor = 2
        self.encoded_bytes = (
            self.message_bytes + parity_bytes if self._use_rs else self.message_bytes * self._repeat_factor
        )
        self.encoded_bits = self.encoded_bytes * 8

    def encode_bits(self, bits: np.ndarray) -> np.ndarray:
        message = _bits_to_bytes(bits)
        if self._use_rs:
            encoded = self._rs_codec.encode(message)
            return _bytes_to_bits(bytes(encoded))

        repeated = bytearray()
        for byte in message:
            repeated.extend([byte] * self._repeat_factor)
        return _bytes_to_bits(bytes(repeated))

    def decode_bits(self, encoded_bits: np.ndarray) -> _DecodedBits:
        encoded_bytes = _bits_to_bytes(encoded_bits[: self.encoded_bits])

        if self._use_rs:
            try:
                decoded = self._rs_codec.decode(encoded_bytes)
                decoded_bytes = bytes(decoded[0] if isinstance(decoded, tuple) else decoded)
                decoded_bytes = decoded_bytes[: self.message_bytes]
                decoded_bits = _bytes_to_bits(decoded_bytes)
                reencoded_bits = self.encode_bits(decoded_bits)
                return _DecodedBits(bits=decoded_bits, success=True, reencoded_bits=reencoded_bits)
            except ReedSolomonError:
                fallback = encoded_bytes[: self.message_bytes]
                fallback_bits = _bytes_to_bits(fallback)
                reencoded_bits = self.encode_bits(fallback_bits)
                return _DecodedBits(bits=fallback_bits, success=False, reencoded_bits=reencoded_bits)

        repeated = np.frombuffer(encoded_bytes, dtype=np.uint8)
        if repeated.size < self.message_bytes * self._repeat_factor:
            padded = np.pad(repeated, (0, self.message_bytes * self._repeat_factor - repeated.size), constant_values=0)
            repeated = padded

        repeated = repeated[: self.message_bytes * self._repeat_factor].reshape(self.message_bytes, self._repeat_factor)
        decoded = np.rint(np.mean(repeated, axis=1)).astype(np.uint8)
        decoded_bits = _bytes_to_bits(decoded.tobytes())
        reencoded_bits = self.encode_bits(decoded_bits)
        return _DecodedBits(bits=decoded_bits, success=True, reencoded_bits=reencoded_bits)


def _is_video_path(path: str) -> bool:
    return os.path.splitext(path.lower())[1] in VIDEO_EXTENSIONS


def _normalize_frame(frame: np.ndarray) -> np.ndarray:
    if frame.ndim == 3:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    else:
        gray = frame

    resized = cv2.resize(gray, FIXED_SIZE, interpolation=cv2.INTER_AREA)
    return resized.astype(np.uint8)


def _build_frame_variants(gray_frame: np.ndarray) -> list[np.ndarray]:
    height, width = gray_frame.shape

    crop_width = max(BLOCK_SIZE * 2, int(width * DEFAULT_CROP_FACTOR))
    crop_height = max(BLOCK_SIZE * 2, int(height * DEFAULT_CROP_FACTOR))
    x_offset = max(0, width - crop_width)
    y_offset = max(0, height - crop_height)
    center_x = max(0, (width - crop_width) // 2)
    center_y = max(0, (height - crop_height) // 2)

    boxes = [
        (0, 0, width, height),
        (center_x, center_y, center_x + crop_width, center_y + crop_height),
        (0, 0, crop_width, crop_height),
        (x_offset, 0, x_offset + crop_width, crop_height),
        (0, y_offset, crop_width, y_offset + crop_height),
        (x_offset, y_offset, x_offset + crop_width, y_offset + crop_height),
    ]

    variants: list[np.ndarray] = []
    for left, top, right, bottom in boxes:
        if right <= left or bottom <= top:
            continue
        variants.append(gray_frame[top:bottom, left:right])

    return variants if variants else [gray_frame]


def _iter_video_frames(path: str, frame_sample_seconds: float, max_frames: int) -> Iterable[np.ndarray]:
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise ValueError(f"Unable to read video: {path}")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 0:
        fps = 25.0

    frame_step = max(1, int(round(fps * max(frame_sample_seconds, 0.01))))
    frame_index = 0
    yielded = 0

    try:
        while yielded < max_frames:
            ok, frame = capture.read()
            if not ok:
                break

            if frame_index % frame_step == 0:
                yielded += 1
                yield frame

            frame_index += 1
    finally:
        capture.release()


def _load_media_frames(image_or_video: str | np.ndarray, frame_sample_seconds: float, max_frames: int) -> list[np.ndarray]:
    if isinstance(image_or_video, np.ndarray):
        return [_normalize_frame(image_or_video)]

    if not isinstance(image_or_video, str) or not image_or_video:
        raise ValueError("image_or_video must be a valid file path or numpy ndarray")

    if not os.path.isfile(image_or_video):
        raise FileNotFoundError(f"Media not found: {image_or_video}")

    if _is_video_path(image_or_video):
        frames = [_normalize_frame(frame) for frame in _iter_video_frames(image_or_video, frame_sample_seconds, max_frames)]
        if not frames:
            raise ValueError(f"No frames sampled from video: {image_or_video}")
        return frames

    image = cv2.imread(image_or_video, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError(f"Unable to decode image: {image_or_video}")

    return [_normalize_frame(image)]


def _dct2(block: np.ndarray) -> np.ndarray:
    return scipy_dct(scipy_dct(block.T, norm="ortho").T, norm="ortho")


def _extract_dct_blocks(gray_frame: np.ndarray) -> np.ndarray:
    height, width = gray_frame.shape
    valid_height = (height // BLOCK_SIZE) * BLOCK_SIZE
    valid_width = (width // BLOCK_SIZE) * BLOCK_SIZE

    if valid_height < BLOCK_SIZE or valid_width < BLOCK_SIZE:
        return np.empty((0, BLOCK_SIZE, BLOCK_SIZE), dtype=np.float32)

    trimmed = gray_frame[:valid_height, :valid_width].astype(np.float32) - 128.0
    blocks: list[np.ndarray] = []

    for y in range(0, valid_height, BLOCK_SIZE):
        for x in range(0, valid_width, BLOCK_SIZE):
            blocks.append(_dct2(trimmed[y : y + BLOCK_SIZE, x : x + BLOCK_SIZE]))

    return np.stack(blocks) if blocks else np.empty((0, BLOCK_SIZE, BLOCK_SIZE), dtype=np.float32)


def _extract_soft_bits_from_frame(
    frame: np.ndarray,
    key: str,
    encoded_bit_count: int,
    repetitions: int,
    frame_seed_index: int,
) -> tuple[np.ndarray, float]:
    blocks = _extract_dct_blocks(frame)
    block_count = len(blocks)
    if block_count == 0:
        raise ValueError("Frame does not contain enough 8x8 blocks for DCT extraction")

    rng_positions = np.random.default_rng(_seed_from_key(key, "positions", frame_seed_index))
    block_indices = rng_positions.integers(0, block_count, size=(encoded_bit_count, repetitions), endpoint=False)
    freq_indices = rng_positions.integers(
        0,
        len(MID_FREQUENCY_COORDS),
        size=(encoded_bit_count, repetitions),
        endpoint=False,
    )

    rng_patterns = np.random.default_rng(_seed_from_key(key, "patterns", frame_seed_index))
    patterns = rng_patterns.choice(np.array([-1.0, 1.0], dtype=np.float32), size=(encoded_bit_count, repetitions))

    soft_scores = np.zeros(encoded_bit_count, dtype=np.float32)

    for bit_index in range(encoded_bit_count):
        coeff_values = np.zeros(repetitions, dtype=np.float32)

        for repeat_index in range(repetitions):
            block_idx = int(block_indices[bit_index, repeat_index])
            u, v = MID_FREQUENCY_COORDS[int(freq_indices[bit_index, repeat_index])]
            coeff_values[repeat_index] = float(blocks[block_idx, u, v])

        pattern = patterns[bit_index]
        denominator = (np.linalg.norm(coeff_values) * np.linalg.norm(pattern)) + 1e-8
        soft_scores[bit_index] = float(np.dot(coeff_values, pattern) / denominator)

    frame_confidence = float(np.mean(np.abs(soft_scores)))
    return soft_scores, frame_confidence


def _extract_soft_bits_with_variants(
    frame: np.ndarray,
    key: str,
    encoded_bit_count: int,
    repetitions: int,
    frame_seed_index: int,
) -> tuple[np.ndarray, float]:
    candidates: list[tuple[np.ndarray, float]] = []

    for variant_index, variant_frame in enumerate(_build_frame_variants(frame)):
        for rotation_index, _rotation in enumerate(ROTATIONS):
            rotated = np.rot90(variant_frame, rotation_index)
            try:
                soft_scores, confidence = _extract_soft_bits_from_frame(
                    rotated,
                    key,
                    encoded_bit_count,
                    repetitions,
                    frame_seed_index=(frame_seed_index * 10000) + (variant_index * 100) + rotation_index,
                )
                candidates.append((soft_scores, max(confidence, 1e-6)))
            except Exception:
                continue

    if not candidates:
        raise ValueError("Unable to extract soft bits from frame variants")

    candidates.sort(key=lambda item: item[1], reverse=True)
    top_candidates = candidates[: min(4, len(candidates))]

    stacked = np.stack([entry[0] for entry in top_candidates])
    weights = np.array([entry[1] for entry in top_candidates], dtype=np.float32)
    if float(np.sum(weights)) <= 0:
        weights = np.ones_like(weights)

    aggregated_soft = np.average(stacked, axis=0, weights=weights)
    confidence = float(np.mean(np.abs(aggregated_soft)))
    return aggregated_soft, confidence


def _recover_bits_from_media(
    frames: list[np.ndarray],
    key: str,
    codec: "_ECCCodec",
    repetitions: int,
) -> tuple[np.ndarray, np.ndarray, float, float, int]:
    encoded_bit_count = codec.encoded_bits
    frame_soft_scores: list[np.ndarray] = []
    frame_confidences: list[float] = []

    for index, frame in enumerate(frames):
        try:
            soft_scores, confidence = _extract_soft_bits_with_variants(
                frame,
                key,
                encoded_bit_count,
                max(1, repetitions),
                frame_seed_index=index,
            )
            frame_soft_scores.append(soft_scores)
            frame_confidences.append(max(confidence, 1e-6))
        except Exception:
            continue

    frames_used = len(frame_soft_scores)
    if frames_used == 0:
        raise ValueError("No usable media frames for robust fingerprint recovery")

    stacked_scores = np.stack(frame_soft_scores)
    weights = np.array(frame_confidences, dtype=np.float32)
    if float(np.sum(weights)) <= 0:
        weights = np.ones_like(weights)

    aggregated_soft = np.average(stacked_scores, axis=0, weights=weights)
    estimated_bits = (aggregated_soft >= 0).astype(np.uint8)

    decoded = codec.decode_bits(estimated_bits)
    recovered_bits = decoded.bits[:HASH_BITS]

    compared_length = min(len(estimated_bits), len(decoded.reencoded_bits))
    mismatches = int(np.count_nonzero(estimated_bits[:compared_length] != decoded.reencoded_bits[:compared_length]))
    bit_error_rate = float(mismatches / max(1, compared_length))

    signal_strength = float(np.mean(np.abs(aggregated_soft)))
    confidence = signal_strength * (1.0 - bit_error_rate)
    if decoded.success:
        confidence += 0.15
    confidence = _clamp(confidence, 0.0, 1.0)

    return recovered_bits, decoded.reencoded_bits, confidence, bit_error_rate, frames_used


def _best_rotation_soft_bits(
    frame: np.ndarray,
    key: str,
    encoded_bit_count: int,
    repetitions: int,
    frame_seed_index: int,
) -> tuple[np.ndarray, float]:
    best_soft = None
    best_confidence = -1.0

    for k, _rotation in enumerate(ROTATIONS):
        rotated = np.rot90(frame, k)
        soft_scores, confidence = _extract_soft_bits_from_frame(
            rotated,
            key,
            encoded_bit_count,
            repetitions,
            frame_seed_index + (k * 1000),
        )

        if confidence > best_confidence:
            best_confidence = confidence
            best_soft = soft_scores

    if best_soft is None:
        raise ValueError("Unable to extract soft bits from any rotation")

    return best_soft, best_confidence


def _media_digest(frames: list[np.ndarray]) -> bytes:
    frame_digests = [_sha256_bytes(frame.tobytes()) for frame in frames]
    if len(frame_digests) == 1:
        return frame_digests[0]

    combined = hashlib.sha256()
    for digest in frame_digests:
        combined.update(digest)
    return combined.digest()


def generate_fingerprint(
    image_or_video: str | np.ndarray,
    key: str = DEFAULT_KEY,
    frame_sample_seconds: float = DEFAULT_FRAME_SAMPLE_SECONDS,
    max_frames: int = DEFAULT_MAX_FRAMES,
    parity_bytes: int = DEFAULT_PARITY_BYTES,
    repetitions: int = DEFAULT_REPETITIONS,
) -> dict:
    """Generate a robust keyed fingerprint from media using the same recovery path as detection."""
    if not key:
        raise ValueError("Generation key must be provided")

    frames = _load_media_frames(image_or_video, frame_sample_seconds, max_frames)
    codec = _ECCCodec(parity_bytes=parity_bytes)
    recovered_bits, reencoded_bits, confidence, bit_error_rate, frames_used = _recover_bits_from_media(
        frames,
        key,
        codec,
        repetitions,
    )

    digest = _bits_to_bytes(recovered_bits)

    return {
        "fingerprint_hex": digest.hex(),
        "fingerprint_bits": recovered_bits.astype(int).tolist(),
        "ecc_bits": reencoded_bits.astype(int).tolist(),
        "frames_used": frames_used,
        "ecc_scheme": "reed-solomon" if codec._use_rs else "repeat-2-fallback",
        "encoded_bit_length": int(codec.encoded_bits),
        "confidence": round(confidence, 4),
        "bit_error_rate": round(bit_error_rate, 4),
    }


def detect_fingerprint(
    image_or_video: str | np.ndarray,
    key: str,
    frame_sample_seconds: float = DEFAULT_FRAME_SAMPLE_SECONDS,
    max_frames: int = DEFAULT_MAX_FRAMES,
    parity_bytes: int = DEFAULT_PARITY_BYTES,
    repetitions: int = DEFAULT_REPETITIONS,
) -> dict:
    """Recover embedded fingerprint from transformed image/video using DCT+matched filtering+ECC."""
    if not key:
        raise ValueError("Detection key must be provided")

    codec = _ECCCodec(parity_bytes=parity_bytes)
    frames = _load_media_frames(image_or_video, frame_sample_seconds, max_frames)
    recovered_bits, _reencoded_bits, confidence, bit_error_rate, frames_used = _recover_bits_from_media(
        frames,
        key,
        codec,
        repetitions,
    )
    recovered_hex = _bits_to_bytes(recovered_bits).hex()

    return {
        "fingerprint": recovered_hex,
        "confidence": round(confidence, 4),
        "bit_error_rate": round(bit_error_rate, 4),
        "frames_used": frames_used,
    }


def _build_cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Robust watermark fingerprint generation and detection")
    subparsers = parser.add_subparsers(dest="mode", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate fingerprint and ECC payload")
    generate_parser.add_argument("input_path", help="Path to image or video")
    generate_parser.add_argument("--key", default=DEFAULT_KEY, help="Secret key used for keyed fingerprint extraction")
    generate_parser.add_argument("--frame-sample-seconds", type=float, default=DEFAULT_FRAME_SAMPLE_SECONDS)
    generate_parser.add_argument("--max-frames", type=int, default=DEFAULT_MAX_FRAMES)
    generate_parser.add_argument("--parity-bytes", type=int, default=DEFAULT_PARITY_BYTES)
    generate_parser.add_argument("--repetitions", type=int, default=DEFAULT_REPETITIONS)

    detect_parser = subparsers.add_parser("detect", help="Detect and recover fingerprint")
    detect_parser.add_argument("input_path", help="Path to image or video")
    detect_parser.add_argument("--key", required=True, help="Secret key used for PRNG position regeneration")
    detect_parser.add_argument("--frame-sample-seconds", type=float, default=DEFAULT_FRAME_SAMPLE_SECONDS)
    detect_parser.add_argument("--max-frames", type=int, default=DEFAULT_MAX_FRAMES)
    detect_parser.add_argument("--parity-bytes", type=int, default=DEFAULT_PARITY_BYTES)
    detect_parser.add_argument("--repetitions", type=int, default=DEFAULT_REPETITIONS)

    return parser


def main() -> int:
    parser = _build_cli_parser()
    args = parser.parse_args()

    try:
        if args.mode == "generate":
            payload = generate_fingerprint(
                args.input_path,
                key=args.key,
                frame_sample_seconds=args.frame_sample_seconds,
                max_frames=args.max_frames,
                parity_bytes=args.parity_bytes,
                repetitions=args.repetitions,
            )
        else:
            payload = detect_fingerprint(
                args.input_path,
                key=args.key,
                frame_sample_seconds=args.frame_sample_seconds,
                max_frames=args.max_frames,
                parity_bytes=args.parity_bytes,
                repetitions=args.repetitions,
            )

        print(json.dumps(payload))
        return 0
    except Exception as exc:
        print(f"watermark module failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
