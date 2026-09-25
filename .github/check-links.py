#!/usr/bin/env python3
"""Check that every internal link and asset reference in the site resolves.

Lives under .github/ so it is never published — the deploy workflow excludes
that directory from the publish directory.

External links are not checked: they go stale for reasons outside this
repository, and a red build because someone else's server is down is a build
people learn to ignore.

Usage:
    python3 .github/check-links.py            # from the repository root
    python3 .github/check-links.py --quiet
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

# href/src/poster on any element, up to the first # or ?
REFERENCE = re.compile(r'(?:href|src|poster|data-src)\s*=\s*["\']([^"\'#?]+)', re.IGNORECASE)
EXTERNAL = re.compile(r"^(https?:|mailto:|tel:|data:|javascript:|//)", re.IGNORECASE)

# Referenced but deliberately absent. Both predate the repository split: the
# figure has an onerror that hides it, and the audio player is a placeholder
# on the credits page. Remove an entry here once the file is added.
KNOWN_MISSING = {
    "research/bqe-decomp/index.html:../../plots/ohlc_overlay.png",
    "pages/credits.html:/assets/audio/ui-sound.mp3",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true", help="only report failures")
    args = parser.parse_args()

    root = pathlib.Path(".").resolve()
    broken: list[str] = []
    stale_exemptions = set(KNOWN_MISSING)
    checked = 0
    pages = 0

    for html in sorted(root.rglob("*.html")):
        if any(part in {".git", ".github", "node_modules", "_site"} for part in html.parts):
            continue
        pages += 1
        relative_page = html.relative_to(root).as_posix()

        for reference in REFERENCE.findall(html.read_text(encoding="utf-8", errors="ignore")):
            if EXTERNAL.match(reference):
                continue
            # A JavaScript template literal (href="${…}") is a URL built at
            # runtime from data; there is nothing on disk to check.
            if reference.startswith("${"):
                continue
            checked += 1

            # A leading slash is the site root, which is the repository root.
            if reference.startswith("/"):
                target = root / reference.lstrip("/")
            else:
                target = html.parent / reference

            try:
                exists = target.resolve().exists()
            except OSError:
                exists = False

            if exists:
                continue

            key = f"{relative_page}:{reference}"
            stale_exemptions.discard(key)
            if key not in KNOWN_MISSING:
                broken.append(f"{relative_page} -> {reference}")

    if not args.quiet:
        print(f"checked {checked} internal references across {pages} pages")

    if stale_exemptions:
        # An exemption for a link that now resolves, or no longer exists, is
        # dead weight that will one day hide a real break.
        print("\nKNOWN_MISSING entries that no longer apply — delete them:", file=sys.stderr)
        for entry in sorted(stale_exemptions):
            print(f"  {entry}", file=sys.stderr)

    if broken:
        print(f"\n{len(broken)} broken reference(s):", file=sys.stderr)
        for entry in broken:
            print(f"  {entry}", file=sys.stderr)
        return 1

    if not args.quiet:
        print("all internal references resolve")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
