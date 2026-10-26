#!/usr/bin/env sh
# Build a distributable plugin zip at build/editor-upgrade-for-tinymce.zip.
# Run via `bun run bundle`.
set -eu

cd "$(dirname "$0")/.."

SLUG=editor-upgrade-for-tinymce
OUT=build/$SLUG
rm -rf build
mkdir -p "$OUT/assets"

# Allowlist: only what WordPress reads at runtime.
cp "$SLUG.php" readme.txt LICENSE changelog.txt "$OUT/"
cp -r includes "$OUT/"
cp -r assets/js assets/vendor "$OUT/assets/"
rm -f "$OUT/assets/vendor/tinymce.sha256"
[ -d languages ] && [ -n "$(ls -A languages)" ] && cp -r languages "$OUT/"

find "$OUT" -type d -empty -delete

(cd build && bestzip "$SLUG.zip" "$SLUG")
rm -rf "$OUT"
echo "Wrote build/$SLUG.zip ($(du -h "build/$SLUG.zip" | cut -f1))"
