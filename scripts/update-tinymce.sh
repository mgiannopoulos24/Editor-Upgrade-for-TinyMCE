#!/usr/bin/env bash
# Vendor a pinned TinyMCE release from npm into assets/vendor/tinymce/.
# Run via `bun run tinymce:update [version]`; defaults to the current assets/vendor/tinymce/VERSION.
set -euo pipefail

cd "$(dirname "$0")/.."

DEST=assets/vendor/tinymce
VERSION="${1:-$(cat "$DEST/VERSION")}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

(cd "$TMP" && npm pack "tinymce@$VERSION" --silent >/dev/null)
tar -xzf "$TMP"/tinymce-*.tgz -C "$TMP"
PKG="$TMP/package"

ACTUAL="$(node -p "require('$PKG/package.json').version")"
[ "$ACTUAL" = "$VERSION" ] || { echo "Expected tinymce@$VERSION, got $ACTUAL" >&2; exit 1; }

rm -rf "$DEST"
mkdir -p "$DEST"

# Runtime files only: no type definitions, changelog, or package metadata.
cp "$PKG"/tinymce.js "$PKG"/tinymce.min.js "$PKG"/license.md "$PKG"/notices.txt "$DEST/"
cp -r "$PKG"/icons "$PKG"/models "$PKG"/plugins "$PKG"/skins "$PKG"/themes "$DEST/"
echo "$VERSION" > "$DEST/VERSION"

(cd "$DEST" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > assets/vendor/tinymce.sha256

echo "Vendored tinymce@$VERSION into $DEST ($(du -sh "$DEST" | cut -f1))"
