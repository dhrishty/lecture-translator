#!/bin/sh
# First launch downloads English/Korean translation models.
set -eu
cd "$(dirname "$0")/.."
# Keep downloaded model assets within this project; no lecture content is stored.
export XDG_DATA_HOME="$PWD/.local-translation/data"
export XDG_CONFIG_HOME="$PWD/.local-translation/config"
export XDG_CACHE_HOME="$PWD/.local-translation/cache"
exec .venv-libretranslate/bin/libretranslate --host 127.0.0.1 --port 5000 --load-only en,ko --disable-web-ui --disable-files-translation
