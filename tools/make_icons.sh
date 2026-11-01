#!/usr/bin/env bash
# Regenerates every app icon (web favicon, PWA manifest, Apple touch, Android launcher, Electron) from two sources:
#   MASTER  the full "DAGYR ONLINE" icon art (square, rounded frame, transparent corners), >= 1024px
#   SMALL   a simplified full-bleed "D" monogram for the tiny sizes (favicon 16/32/48), where the full art is mush
# Usage: tools/make_icons.sh tools/icon-src/dagyr-icon-master.png tools/icon-src/dagyr-monogram.png
set -euo pipefail
cd "$(dirname "$0")/.."
MASTER=${1:?master icon png}
SMALL=${2:?small monogram png}
BG='#140806'   # the art's darkest ember tone: fills behind maskable / adaptive / apple icons
UI=assets/ui
RES=android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- web / desktop ---------------------------------------------------------------------------------
magick "$MASTER" -resize 1024x1024 "$UI/icon-1024.png"
magick "$MASTER" -resize 512x512 "$UI/icon.png"              # Electron window/taskbar, legacy references
magick "$MASTER" -resize 512x512 "$UI/icon-512.png"
magick "$MASTER" -resize 192x192 "$UI/icon-192.png"
# maskable (PWA): full-bleed background, art inside the 80% safe circle
magick -size 512x512 "xc:$BG" \( "$MASTER" -resize 410x410 \) -gravity center -composite "$UI/icon-maskable-512.png"
# Apple touch: opaque (iOS rounds the corners itself)
magick -size 180x180 "xc:$BG" \( "$MASTER" -resize 168x168 \) -gravity center -composite -alpha off "$UI/apple-touch-icon.png"
# favicons: the monogram, rounded a touch so it reads as a tile in a tab
magick -size 512x512 xc:none -fill white -draw "roundrectangle 0,0 511,511 90,90" "$TMP/round.png"
magick "$SMALL" -gravity center -crop 80%x80%+0+0 +repage -resize 512x512^ -gravity center -extent 512x512 "$TMP/round.png" -alpha off -compose CopyOpacity -composite "$TMP/small.png"
magick "$TMP/small.png" -resize 16x16 -unsharp 0x0.6 "$UI/favicon-16.png"
magick "$TMP/small.png" -resize 32x32 -unsharp 0x0.6 "$UI/favicon-32.png"
magick "$TMP/small.png" -resize 48x48 "$TMP/f48.png"
magick "$UI/favicon-16.png" "$UI/favicon-32.png" "$TMP/f48.png" "$UI/favicon.ico"

# --- Android launcher ------------------------------------------------------------------------------
# legacy (pre-8.0) square + round, and the adaptive foreground (108dp canvas, art kept inside the ~72dp safe zone)
declare -A LEG=([mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192)
declare -A FG=([mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432)
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  s=${LEG[$d]}; f=${FG[$d]}
  magick "$MASTER" -resize ${s}x${s} "$RES/mipmap-$d/ic_launcher.png"
  # round: a dark disc with the art fitted inside it
  inner=$(( s * 86 / 100 ))
  magick -size ${s}x${s} xc:none -fill "$BG" -draw "circle $((s/2)),$((s/2)) $((s/2)),0" \
    \( "$MASTER" -resize ${inner}x${inner} \) -gravity center -composite \
    \( -size ${s}x${s} xc:none -fill white -draw "circle $((s/2)),$((s/2)) $((s/2)),0" \) -compose DstIn -composite \
    "$RES/mipmap-$d/ic_launcher_round.png"
  art=$(( f * 70 / 100 ))
  magick -size ${f}x${f} xc:none \( "$MASTER" -resize ${art}x${art} \) -gravity center -composite "$RES/mipmap-$d/ic_launcher_foreground.png"
done
# adaptive background colour
cat > "$RES/values/ic_launcher_background.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$BG</color>
</resources>
EOF
echo "icons written"
