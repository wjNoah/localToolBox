#!/usr/bin/env python3
"""Render the extension icons to icons/icon-{16,32,48,128}.png.

Standard library only (zlib + struct), so the repo keeps zero dependencies.
The icon is a hammer on a charcoal rounded square. Shapes are
drawn as signed distances and supersampled for anti-aliasing.

    python3 scripts/build-icons.py
"""

import math
import os
import struct
import zlib

BACKGROUND = (0x26, 0x23, 0x1F)  # charcoal
HEAD = (0xEC, 0xE6, 0xDA)        # steel, warm-tinted
HANDLE = (0xE8, 0x89, 0x2B)      # wood / safety orange
SIZES = (16, 32, 48, 128)
SAMPLES = 4  # per axis

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")


def rounded_rect(x, y, half, radius):
    """Signed distance to a rounded square centred on 0,0 (negative inside)."""
    qx = abs(x) - half + radius
    qy = abs(y) - half + radius
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    return outside + min(max(qx, qy), 0.0) - radius


def segment(x, y, ax, ay, bx, by):
    """Distance from x,y to the segment a-b."""
    px, py = x - ax, y - ay
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, (px * dx + py * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - t * dx, py - t * dy)


def box(x, y, cx, cy, hx, hy, radius):
    """Signed distance to an axis-aligned rounded box."""
    dx = abs(x - cx) - hx + radius
    dy = abs(y - cy) - hy + radius
    return math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0) - radius


def sample(u, v, size):
    """Colour at unit coordinates u,v (None = transparent)."""
    if rounded_rect(u, v, 1.0, 0.30) > 0:
        return None
    # The hammer is drawn upright in x,y (y down) and tilted 45° clockwise,
    # so the head sits top right and the handle runs to the bottom left.
    k = math.sqrt(0.5)
    # Scaled up and nudged down so the hammer's mass sits in the middle.
    x = (u + v) * k / 1.2
    y = (v - u) * k / 1.2 - 0.12
    # Thicker parts at small sizes so the shape survives at 16px.
    handle = 0.15 if size <= 16 else 0.12
    head_h = 0.20 if size <= 16 else 0.17
    # Head: flat striking face on the left, tapered peen on the right.
    taper = max(0.0, x - 0.1) * 0.35
    if box(x, y, 0.02, -0.46, 0.50, head_h - taper, 0.04) <= 0:
        return HEAD
    if segment(x, y, 0.0, 0.66, 0.0, -0.30) <= handle:
        return HANDLE
    return BACKGROUND


def render(size):
    # Chrome Web Store asks for 96x96 artwork inside the 128x128 icon.
    pad = size * (16 / 128) if size == 128 else size / 16
    half = (size - 2 * pad) / 2
    centre = size / 2
    rows = []
    for py in range(size):
        row = bytearray([0])  # filter type: none
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    x = px + (sx + 0.5) / SAMPLES
                    y = py + (sy + 0.5) / SAMPLES
                    colour = sample((x - centre) / half, (y - centre) / half, size)
                    if colour:
                        r += colour[0]
                        g += colour[1]
                        b += colour[2]
                        a += 1
            if a:
                row += bytes((r // a, g // a, b // a, round(255 * a / SAMPLES**2)))
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return png(size, b"".join(rows))


def png(size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(render(size))
        print(os.path.relpath(path))


if __name__ == "__main__":
    main()
