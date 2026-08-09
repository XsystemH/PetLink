#!/usr/bin/env python3
"""Validate an 8-bit transparent PNG for PetLink without third-party packages."""

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


def validate(path: Path) -> dict[str, object]:
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
    safety = min(width, height) * 0.06
    if left < safety or top < safety or width - right < safety or height - bottom < safety:
        issues.append("character needs at least 6% clear margin on every side")
    height_ratio = bounds_height / height
    if not 0.65 <= height_ratio <= 0.9:
        issues.append("character height should occupy about 65-90% of the canvas")

    split = round(top + bounds_height * 0.4)
    upper_count = sum(1 for x, y in opaque if left <= x < right and top <= y < split)
    lower_count = sum(1 for x, y in opaque if left <= x < right and split <= y < bottom)
    total = upper_count + lower_count
    if total and upper_count / total < 0.15:
        issues.append("upper/head region contains too little visible content")
    if total and lower_count / total < 0.35:
        issues.append("lower/body region contains too little visible content")
    corner_indexes = [0, width - 1, (height - 1) * width, height * width - 1]
    if any(alpha[index] > 4 for index in corner_indexes):
        issues.append("canvas corners must be transparent")

    return {
        "ok": not issues,
        "issues": issues,
        "canvas": [width, height],
        "opaqueBounds": [left, top, right, bottom],
        "splitY": split,
        "upperOpaqueRatio": round(upper_count / total, 4) if total else 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    args = parser.parse_args()
    result = validate(args.image)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
