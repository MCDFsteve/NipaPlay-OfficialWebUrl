#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/nipaplay.aimes-soft.com}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
DATA_ROOT="${NIPAPLAY_DATA_ROOT:-/www/nipaplay-data}"
RUNTIME_DIR="${NIPAPLAY_RUNTIME_DIR:-/opt/nipaplay-next-runtime}"
LOCK_FILE="/tmp/nipaplay-next-deploy.lock"
BUILD_MARKER="$APP_DIR/.next/.deployed-head"
NPM_EMPTY_USERCONFIG="${NIPAPLAY_NPM_USERCONFIG:-/tmp/nipaplay-empty-user-npmrc}"
NPM_EMPTY_GLOBALCONFIG="${NIPAPLAY_NPM_GLOBALCONFIG:-/tmp/nipaplay-empty-global-npmrc}"
NPM_CACHE_DIR="${NIPAPLAY_NPM_CACHE:-/tmp/nipaplay-npm-cache}"
NPM_PREFIX_DIR="${NIPAPLAY_NPM_PREFIX:-/tmp/nipaplay-npm-prefix}"
NPM_REGISTRY="${NIPAPLAY_NPM_REGISTRY:-https://registry.npmjs.org}"
export HOME="${HOME:-/root}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "deploy already running"
  exit 0
fi

cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1 || true

NVM_HOME="$HOME"
if [ -s "$NVM_HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_HOME/.nvm/nvm.sh"
  nvm use 22 >/dev/null || nvm use --lts >/dev/null || true
fi

if [ -f "$APP_DIR/.env.production" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env.production"
  set +a
fi

export NODE_ENV=production
export PORT="${PORT:-3010}"
export NIPAPLAY_DATA_ROOT="${NIPAPLAY_DATA_ROOT:-$DATA_ROOT}"
export MUSIC_LIBRARY_CODE="${MUSIC_LIBRARY_CODE:-irigas}"
export MUSIC_LIBRARY_ROOT="${MUSIC_LIBRARY_ROOT:-$NIPAPLAY_DATA_ROOT/music_library_data}"

mkdir -p "$NIPAPLAY_DATA_ROOT"

prepare_npm_config() {
  mkdir -p "$NPM_CACHE_DIR" "$NPM_PREFIX_DIR"
  : > "$NPM_EMPTY_USERCONFIG"
  : > "$NPM_EMPTY_GLOBALCONFIG"
}

install_runtime_dependencies() {
  prepare_npm_config
  mkdir -p "$RUNTIME_DIR"
  cp "$APP_DIR/package.json" "$APP_DIR/package-lock.json" "$RUNTIME_DIR/"
  (
    cd "$RUNTIME_DIR"
    NPM_CONFIG_USERCONFIG="$NPM_EMPTY_USERCONFIG" \
    NPM_CONFIG_GLOBALCONFIG="$NPM_EMPTY_GLOBALCONFIG" \
    NPM_CONFIG_CACHE="$NPM_CACHE_DIR" \
    NPM_CONFIG_PREFIX="$NPM_PREFIX_DIR" \
    NPM_CONFIG_REGISTRY="$NPM_REGISTRY" \
      npm ci --include=dev --no-audit --no-fund --loglevel=error
  )
}

remove_app_node_modules() {
  if [ -L "$APP_DIR/node_modules" ]; then
    unlink "$APP_DIR/node_modules"
  else
    rm -rf "$APP_DIR/node_modules"
  fi
}

copy_runtime_node_modules_for_build() {
  remove_app_node_modules
  cp -a "$RUNTIME_DIR/node_modules" "$APP_DIR/node_modules"
}

link_runtime_node_modules_for_start() {
  remove_app_node_modules
  ln -s "$RUNTIME_DIR/node_modules" "$APP_DIR/node_modules"
}

if [ ! -f "$NIPAPLAY_DATA_ROOT/.seeded-from-site" ]; then
  for item in data lrcs song_details cloud_playlists watch_progress_data music_library_data; do
    if [ -e "$APP_DIR/$item" ] && [ ! -e "$NIPAPLAY_DATA_ROOT/$item" ]; then
      cp -a "$APP_DIR/$item" "$NIPAPLAY_DATA_ROOT/$item"
    fi
  done
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$NIPAPLAY_DATA_ROOT/.seeded-from-site"
fi

git fetch "$REMOTE" "$BRANCH"
LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "$REMOTE/$BRANCH")"
BUILT_HEAD=""
if [ -f "$BUILD_MARKER" ]; then
  BUILT_HEAD="$(cat "$BUILD_MARKER" 2>/dev/null || true)"
fi

if [ "${FORCE_DEPLOY:-0}" != "1" ] && [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ] && [ "$BUILT_HEAD" = "$LOCAL_HEAD" ]; then
  echo "already up to date: $LOCAL_HEAD"
  exit 0
fi

git pull --ff-only "$REMOTE" "$BRANCH"
LOCAL_HEAD="$(git rev-parse HEAD)"
install_runtime_dependencies
copy_runtime_node_modules_for_build
"$APP_DIR/node_modules/.bin/next" build
link_runtime_node_modules_for_start

pm2 delete nipaplay-next >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --update-env

mkdir -p "$(dirname "$BUILD_MARKER")"
printf '%s\n' "$LOCAL_HEAD" > "$BUILD_MARKER"
pm2 save
