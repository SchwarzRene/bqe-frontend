#!/usr/bin/env sh
#
# Assemble the directory Cloudflare publishes.
#
# An allowlist: only the site's own files are copied into _site/. Everything
# else in the repository — the Worker's source, the migrations, the docs, and
# above all local secrets such as .dev.vars or .env — stays off the CDN even
# when `npm run deploy` runs on a machine that has them. A new top-level
# folder is published only once it is added to SITE below.
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
SITE="index.html _headers graph390b.png assets components pages research"

rm -rf "$OUT"
mkdir -p "$OUT"

for entry in $SITE; do
  if [ ! -e "$entry" ]; then
    echo "build.sh: $entry is missing — refusing to publish" >&2
    exit 1
  fi
  cp -R "$entry" "$OUT"/
done

# Nothing hidden is ever published: a dotfile inside a site folder is far
# more likely a stray secret or editor file than content.
hidden=$(find "$OUT" -name '.*' ! -name '.' | head -n 5)
if [ -n "$hidden" ]; then
  echo "build.sh: hidden files in $OUT — refusing to publish:" >&2
  echo "$hidden" >&2
  exit 1
fi

# A site without an entry point is a broken deploy that still reports success,
# so fail here instead.
if [ ! -f "$OUT/index.html" ]; then
  echo "build.sh: $OUT/index.html is missing — refusing to publish" >&2
  exit 1
fi

echo "build.sh: $(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1)"
