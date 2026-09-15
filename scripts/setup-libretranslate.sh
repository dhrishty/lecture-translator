#!/bin/sh
# Run only after approving local service setup. Installs software, not lecture data.
set -eu
cd "$(dirname "$0")/.."
python3 -m venv .venv-libretranslate
.venv-libretranslate/bin/python -m pip install libretranslate==1.9.6
printf '%s\n' 'Installed. Start with: sh scripts/start-libretranslate.sh'
