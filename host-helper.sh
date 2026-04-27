#!/bin/bash
# Tiny watchdog: when the game enters `reveal` phase, wait a few seconds then call `next`.
# Exits when phase is `ended`. Hard-cap of 60 minutes.
URL=$1
ROOM=$2
TOKEN=$3
DEADLINE=$(($(date +%s) + 3600))

while [ $(date +%s) -lt $DEADLINE ]; do
  PHASE=$(node bot-cli.mjs status --url "$URL" --room "$ROOM" --token "$TOKEN" --field state.phase 2>/dev/null | tr -d '"')
  if [ "$PHASE" = "ended" ]; then
    echo "[host-helper] game ended"
    exit 0
  elif [ "$PHASE" = "reveal" ]; then
    sleep 4
    echo "[host-helper] advancing round"
    node bot-cli.mjs next --url "$URL" --room "$ROOM" --token "$TOKEN" >/dev/null 2>&1
    sleep 2
  else
    sleep 4
  fi
done
echo "[host-helper] timed out waiting for game to end"
exit 1
