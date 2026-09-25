#!/usr/bin/env python3
"""Build research/markettape/worldmap.svg, the region picker of Market News.

The outlines come from the History Map's present-day borders
(research/historymap/data/world_2010.geojson), simplified and grouped into the
regions Market News filters by: us, eu, asia, ru. Everything else is drawn as
plain land ("other") and cannot be picked.

    python3 docs/tools/market-news-map.py

Plain equirectangular projection, Antarctica cut off. Re-run after changing a
region's countries; the page needs no other change.
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "research/historymap/data/world_2010.geojson")
OUT = os.path.join(ROOT, "research/markettape/worldmap.svg")

REGIONS = {
    "us": {"United States", "Puerto Rico", "United States Virgin Islands"},
    "ru": {"Russia"},
    "eu": {
        "Albania", "Andorra", "Austria", "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Byelarus", "Croatia",
        "Cyprus", "Czech Republic", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
        "Iceland", "Ireland", "Italy", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Macedonia", "Malta",
        "Moldova", "Montenegro", "Netherlands", "Norway", "Poland", "Portugal", "Romania", "Serbia", "Slovakia",
        "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom", "Turkish Cypriot-administered area",
    },
    "asia": {
        "Afghanistan", "Bangladesh", "Bhutan", "Brunei", "Burma", "Cambodia", "China", "Hong Kong", "India",
        "Indonesia", "Japan", "Kazakhstan", "Korea, Democratic People's Republic of", "Korea, Republic of",
        "Kyrgyzstan", "Laos", "Malaysia", "Mongolia", "Nepal", "Pakistan", "Philippines", "Sri Lanka", "Taiwan",
        "Tajikistan", "Thailand", "Turkmenistan", "Uzbekistan", "Vietnam",
    },
}

W, LAT_TOP, LAT_BOTTOM = 1000, 84.0, -57.0
SCALE = W / 360.0
H = round((LAT_TOP - LAT_BOTTOM) * SCALE)
TOLERANCE = 0.4  # degrees
MIN_AREA = 0.6  # square degrees; smaller islands are dropped


def region_of(name):
    for code, names in REGIONS.items():
        if name in names:
            return code
    return "other"


def simplify(points, tol):
    """Douglas-Peucker, iterative."""
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            x, y = points[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))) / 2


def project(lon, lat):
    lat = max(min(lat, LAT_TOP), LAT_BOTTOM)
    return round((lon + 180) * SCALE, 1), round((LAT_TOP - lat) * SCALE, 1)


def ring_path(ring):
    pts = [project(x, y) for x, y in ring]
    out = []
    for p in pts:
        if not out or out[-1] != p:
            out.append(p)
    if len(out) < 3:
        return ""
    fmt = lambda v: ("%.1f" % v).rstrip("0").rstrip(".")
    return "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in out) + "Z"


def main():
    data = json.load(open(SRC))
    paths = {"other": [], "us": [], "eu": [], "asia": [], "ru": []}
    for f in data["features"]:
        geom = f.get("geometry")
        if not geom:
            continue
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        code = region_of(str(f["properties"].get("NAME")))
        for poly in polys:
            ring = [tuple(p[:2]) for p in poly[0]]  # outer ring only
            if max(y for _, y in ring) < LAT_BOTTOM or area(ring) < MIN_AREA:
                continue
            # A closed ring starts and ends on the same point: simplify its two halves.
            mid = len(ring) // 2
            d = ring_path(simplify(ring[: mid + 1], TOLERANCE)[:-1] + simplify(ring[mid:], TOLERANCE))
            if d:
                paths[code].append(d)
    labels = {"us": "United States", "eu": "Europe", "asia": "Asia", "ru": "Russia"}
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" class="worldmap" role="group" aria-label="World map: pick a region">',
        f'<path class="land" d="{"".join(paths["other"])}"/>',
    ]
    for code in ("us", "eu", "asia", "ru"):
        parts.append(
            f'<path class="region" data-region="{code}" tabindex="0" role="button" aria-label="{labels[code]}" d="{"".join(paths[code])}"/>'
        )
    parts.append("</svg>")
    open(OUT, "w").write("\n".join(parts) + "\n")
    print(f"{OUT}: {os.path.getsize(OUT) // 1024} KB, viewBox {W}x{H}")


if __name__ == "__main__":
    main()
