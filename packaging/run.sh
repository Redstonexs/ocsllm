#!/usr/bin/env sh
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONFIG="$DIR/config.env"

if [ ! -f "$CONFIG" ]; then
  CONFIG="$DIR/config.example.env"
fi

set -a
. "$CONFIG"
set +a

exec "$DIR/ocs-llm-solver" "$@"
