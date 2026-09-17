#!/bin/zsh
set -e

APP_DIR="${0:A:h}"
PORT="4190"
URL="http://127.0.0.1:${PORT}/"
LOG_FILE="/tmp/data-science-universe.log"

if ! curl --silent --fail "${URL}" >/dev/null 2>&1; then
  cd "${APP_DIR}/dist"
  nohup python3 -m http.server "${PORT}" --bind 127.0.0.1 >"${LOG_FILE}" 2>&1 &
  for attempt in {1..30}; do
    if curl --silent --fail "${URL}" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

open "${URL}"
echo "Data Science Universe is open at ${URL}"
echo "If the browser does not appear, paste that address into it."
sleep 2
