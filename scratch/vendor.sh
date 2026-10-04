#!/bin/sh
# Fetches the Scratch editor into scratch/gui, ready to be served as it is.
#
# Run from the top of the repository:   sh scratch/vendor.sh
#
# What lands in scratch/gui is the Scratch Foundation's own published build
# of the editor, unchanged, with some files left out:
#   - source maps
#   - the non-standalone build, which expects the page to bring its own React
#   - the tutorial pictures (the Tutorials menu is not shown in the hub)
#   - the face sensing model (the editor is not given the camera)
# One thing in the files that are kept is edited: the build has the site's
# address for its own files written in as "/", which only works when the
# editor is at the very top of a website. That is changed to read the
# address editor.html works out (window.__hubScratchBase). Everything else
# the hub changes about the editor is done from scratch/editor.js, which is
# ours.
#
# To move to a newer editor, change VERSION, run this again, and try a
# Scratch task in a lesson before committing: editor.js hides some buttons
# by the class names this build gives them.
set -eu

VERSION="15.2.0"
PKG="@scratch/scratch-gui@$VERSION"

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

( cd "$WORK" && npm pack "$PKG" --silent >/dev/null && tar xzf ./*.tgz )
SRC="$WORK/package"
OUT="$HERE/gui"

rm -rf "$OUT"
mkdir -p "$OUT"

cp "$SRC/LICENSE" "$SRC/TRADEMARK" "$OUT/"
cp "$SRC/dist/scratch-gui-standalone.js.LICENSE.txt" "$OUT/"
sed 's#\.p="/"#.p=(self.__hubScratchBase||"/")#g' "$SRC/dist/scratch-gui-standalone.js" \
  > "$OUT/scratch-gui-standalone.js"
if [ "$(grep -o '__hubScratchBase' "$OUT/scratch-gui-standalone.js" | wc -l)" -lt 2 ]; then
  echo "The editor build no longer looks the way vendor.sh expects. Check its public path." >&2
  exit 1
fi
cp "$SRC/dist/extension-worker.js" "$SRC/dist/extension-worker.js.LICENSE.txt" "$OUT/"
cp "$SRC"/dist/*.hex "$OUT/"
cp -R "$SRC/dist/libraries" "$OUT/libraries"

mkdir -p "$OUT/chunks"
for f in "$SRC"/dist/chunks/*; do
  case "$f" in
    *.map) ;;
    */mediapipe) ;;
    *) cp -R "$f" "$OUT/chunks/" ;;
  esac
done

# The tutorial pictures are named after the files under decks/ in the
# source, and the build adds a hash: add-sprite.jpg -> add-sprite.<hash>.jpg
mkdir -p "$OUT/static/assets"
cp -R "$SRC/dist/static/blocks-media" "$OUT/static/blocks-media"
( cd "$SRC/src/lib/libraries/decks" && ls steps thumbnails ) \
  | grep -E '\.(png|gif|jpg|jpeg)$' | sed -E 's/\.[a-z]+$//' | sort -u > "$WORK/tutorial-all"
# Some extension pictures share a name with a tutorial one (video-sensing),
# and those are kept.
find "$SRC/src/lib/libraries/extensions" -type f \
  | sed -E 's#.*/##; s/\.[a-z]+$//' | sort -u > "$WORK/extension-names"
comm -23 "$WORK/tutorial-all" "$WORK/extension-names" > "$WORK/tutorial-names"
for f in "$SRC"/dist/static/assets/*; do
  name="$(basename "$f")"
  case "$name" in *.map) continue ;; esac
  stem="$(printf '%s' "$name" | sed -E 's/\.[0-9a-f]{20}\.[a-zA-Z]+$//')"
  if grep -qxF "$stem" "$WORK/tutorial-names"; then continue; fi
  cp "$f" "$OUT/static/assets/"
done

printf '%s\n' "$PKG" > "$OUT/VERSION"
du -sh "$OUT"
