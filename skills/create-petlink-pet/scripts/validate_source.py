#!/usr/bin/env python3
"""Validate one transparent PNG for PetLink's fixed part masks."""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    distances = (abs(estimate - left), abs(estimate - above), abs(estimate - upper_left))
    return (left, above, upper_left)[distances.index(min(distances))]


def read_alpha(path: Path) -> tuple[int, int, list[int]]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("source must be a PNG")
    offset = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = interlace = 0
    compressed = bytearray()
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            break
    if bit_depth != 8 or color_type not in (4, 6) or interlace != 0:
        raise ValueError("PNG must be non-interlaced 8-bit RGBA or grayscale-alpha")
    bytes_per_pixel = 4 if color_type == 6 else 2
    stride = width * bytes_per_pixel
    raw = zlib.decompress(bytes(compressed))
    expected = height * (stride + 1)
    if len(raw) != expected:
        raise ValueError("PNG pixel data has an unexpected size")

    previous = bytearray(stride)
    alpha: list[int] = []
    cursor = 0
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        encoded = raw[cursor : cursor + stride]
        cursor += stride
        row = bytearray(stride)
        for index, value in enumerate(encoded):
            left = row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            above = previous[index]
            upper_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            if filter_type == 0:
                decoded = value
            elif filter_type == 1:
                decoded = value + left
            elif filter_type == 2:
                decoded = value + above
            elif filter_type == 3:
                decoded = value + ((left + above) // 2)
            elif filter_type == 4:
                decoded = value + paeth(left, above, upper_left)
            else:
                raise ValueError(f"unsupported PNG filter {filter_type}")
            row[index] = decoded & 0xFF
        alpha.extend(row[bytes_per_pixel - 1 :: bytes_per_pixel])
        previous = row
    return width, height, alpha


PARTS = {
    "head",
    "body",
    "arm-left",
    "arm-right",
    "leg-left",
    "leg-right",
    "ear-left",
    "ear-right",
}


def validate(path: Path, part: str) -> dict[str, object]:
    issues: list[str] = []
    try:
        width, height, alpha = read_alpha(path)
    except (OSError, ValueError, zlib.error) as error:
        return {"ok": False, "issues": [str(error)]}
    if width != height:
        issues.append("canvas must be square")
    if min(width, height) < 512:
        issues.append("canvas must be at least 512 x 512")

    opaque = [(index % width, index // width) for index, value in enumerate(alpha) if value >= 32]
    if not opaque:
        return {"ok": False, "issues": issues + ["no opaque character was found"]}
    xs = [point[0] for point in opaque]
    ys = [point[1] for point in opaque]
    left, right, top, bottom = min(xs), max(xs) + 1, min(ys), max(ys) + 1
    bounds_width, bounds_height = right - left, bottom - top
    safety = min(width, height) * 0.02
    if left < safety or top < safety or width - right < safety or height - bottom < safety:
        issues.append("part needs about 2% transparent margin on every side")
    width_ratio = bounds_width / width
    height_ratio = bounds_height / height
    if part == "head" and (width_ratio < 0.55 or height_ratio < 0.55):
        issues.append("head should fill at least 55% of both canvas dimensions")
    elif part == "body" and (width_ratio < 0.35 or height_ratio < 0.65):
        issues.append("body should fill at least 35% of width and 65% of height")
    elif (part.startswith("arm-") or part.startswith("leg-")) and (width_ratio < 0.18 or height_ratio < 0.60):
        issues.append("limb should fill at least 18% of width and 60% of height")
    elif part.startswith("ear-") and (width_ratio < 0.30 or height_ratio < 0.50):
        issues.append("ear should fill at least 30% of width and 50% of height")
    corner_indexes = [0, width - 1, (height - 1) * width, height * width - 1]
    if any(alpha[index] > 4 for index in corner_indexes):
        issues.append("canvas corners must be transparent")

    return {
        "ok": not issues,
        "issues": issues,
        "canvas": [width, height],
        "part": part,
        "opaqueBounds": [left, top, right, bottom],
        "widthRatio": round(width_ratio, 4),
        "heightRatio": round(height_ratio, 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--part", required=True, choices=sorted(PARTS))
    args = parser.parse_args()
    result = validate(args.image, args.part)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
