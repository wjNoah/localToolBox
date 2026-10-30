#!/usr/bin/env bash
# Render the Chrome Web Store screenshots and promo tile into store/*.png
# with headless Chrome. The pages are served from localhost only, because
# ES modules don't load over file://.
#
#   ./scripts/store-assets.sh
set -euo pipefail

cd "$(dirname "$0")/.."

chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
[[ -x "$chrome" ]] || { echo "Chrome not found; set CHROME=/path/to/chrome" >&2; exit 1; }

port=8765
python3 -I -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
sleep 1

profile=$(mktemp -d)
shoot() { # url output width height
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --no-first-run --force-dark-mode \
    --user-data-dir="$profile" --force-device-scale-factor=1 \
    --window-size="$3,$4" --virtual-time-budget=4000 \
    --screenshot="$PWD/$2" "http://127.0.0.1:$port/$1" >/dev/null 2>&1
  echo "$2"
}

shoot "store/frame.html?shot=jwt"  store/screenshot-1-jwt.png  1280 800
shoot "store/frame.html?shot=json" store/screenshot-2-json.png 1280 800
shoot "store/frame.html?shot=time" store/screenshot-3-time.png 1280 800
shoot "store/promo.html"           store/promo-small.png       440 280

rm -rf "$profile"
