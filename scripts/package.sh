#!/usr/bin/env bash
# Build the ZIP to upload to the Chrome Web Store: dist/local-dev-toolbox-<version>.zip
#
#   ./scripts/package.sh
#
# Only the files the extension needs go in: no .git, .idea, scripts or README.
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(python3 -I -c 'import json; print(json.load(open("manifest.json"))["version"])')

for icon in 16 32 48 128; do
  [[ -f "icons/icon-$icon.png" ]] || { echo "missing icons/icon-$icon.png — run scripts/build-icons.py" >&2; exit 1; }
done

out="dist/local-dev-toolbox-$version.zip"
mkdir -p dist
rm -f "$out"
zip -qr "$out" manifest.json popup icons LICENSE -x '*.DS_Store'

echo "$out"
unzip -l "$out" | tail -n 1
