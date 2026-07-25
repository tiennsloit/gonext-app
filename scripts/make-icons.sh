#!/usr/bin/env bash
# Regenerate the app icons from build/icon.svg.
#
#   npm run icons
#
# Produces build/icon.png (1024x1024, used for the Linux targets) and
# build/icon.icns (the full macOS iconset). electron-builder picks both up
# from the buildResources dir automatically.
#
# There is no SVG rasteriser in the toolchain, so this renders through headless
# Chrome; sips + iconutil (both stock macOS) handle the resizing and packing.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build="$root/build"
svg="$build/icon.svg"
png="$build/icon.png"

[ -f "$svg" ] || { echo "missing $svg" >&2; exit 1; }

chrome=""
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Chromium.app/Contents/MacOS/Chromium" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  [ -x "$c" ] && { chrome="$c"; break; }
done
[ -n "$chrome" ] || { echo "need Chrome/Chromium installed to rasterise the SVG" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Chrome screenshots the viewport, so pin the page to exactly 1024x1024 with a
# transparent backdrop and no margins.
{
  echo '<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>'
  cat "$svg"
} > "$tmp/icon.html"

"$chrome" --headless --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot="$png" "file://$tmp/icon.html" >/dev/null 2>&1

[ -s "$png" ] || { echo "chrome produced no output" >&2; exit 1; }
echo "wrote $png"

iconset="$tmp/icon.iconset"
mkdir -p "$iconset"
# name:pixel-size pairs required by iconutil
for pair in 16x16:16 16x16@2x:32 32x32:32 32x32@2x:64 128x128:128 128x128@2x:256 \
            256x256:256 256x256@2x:512 512x512:512 512x512@2x:1024; do
  name="${pair%%:*}"
  size="${pair##*:}"
  sips -z "$size" "$size" "$png" --out "$iconset/icon_$name.png" >/dev/null
done

iconutil -c icns "$iconset" -o "$build/icon.icns"
echo "wrote $build/icon.icns"
