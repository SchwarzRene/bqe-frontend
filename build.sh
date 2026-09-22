#!/usr/bin/env sh
#
# Assemble the directory Cloudflare publishes.
#
# The repository root is the site root, but a few things in it are repository
# furniture rather than site content: the workflows, the docs, this script and
# the README. Copying everything else into _site/ keeps them off the CDN.
#
# Cloudflare runs this as the project's build command, with _site as the
# output directory. It also works locally:
#
#     ./build.sh && cd _site && python3 -m http.server 8000
#
# Deliberately plain sh and cp — no rsync, no bash-isms — so it behaves the
# same in Cloudflare's build container as it does on your machine.
set -eu

OUT=_site

rm -rf "$OUT"
mkdir -p "$OUT"

for entry in * .[!.]*; do
  # The glob itself when a pattern matches nothing.
  [ -e "$entry" ] || continue

  case "$entry" in
    "$OUT"|.git|.github|.gitignore|docs|build.sh|README.md|CNAME) continue ;;
    wrangler.toml|wrangler.jsonc|.wrangler|node_modules) continue ;;
  esac

  cp -R "$entry" "$OUT"/
done

# A site without an entry point is a broken deploy that still reports success,
# so fail here instead.
if [ ! -f "$OUT/index.html" ]; then
  echo "build.sh: $OUT/index.html is missing — refusing to publish" >&2
  exit 1
fi

echo "build.sh: $(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1)"
