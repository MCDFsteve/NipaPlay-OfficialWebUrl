# NipaPlay Official Website

This repository now runs the NipaPlay official website through Next.js.

The public homepage and docs are still served from the existing HTML files for
compatibility, while the server-side APIs and management UI are implemented in
Next.js route handlers.

## What Is Included

- Legacy-compatible routes for the old PHP endpoints:
  - `cloud_playlist.php`
  - `lyrics_service.php`
  - `song_id_service.php`
  - `song_detail.php`
  - `watch_progress_sync.php`
  - `danmaku_proxy.php`
  - `music_library.php`
- A web admin console at `/admin` for editing releases, guides, song IDs,
  lyrics, song details, and cloud playlists.
- Filesystem-backed storage so changes are visible immediately.
- Static file routes for cached assets and release binaries that are kept out
  of Git.

## Local Development

```bash
npm install
npm run dev
```

The app reads mutable content from the repository root by default. In
production, set `NIPAPLAY_DATA_ROOT` to an external data directory so automatic
Git deploys do not conflict with admin edits.

## Production Environment

Required:

```bash
ADMIN_PASSWORD=change-this
AUTH_SECRET=change-this-too
NIPAPLAY_DATA_ROOT=/www/nipaplay-data
PORT=3010
```

Optional:

```bash
MUSIC_LIBRARY_CODE=irigas
MUSIC_LIBRARY_ROOT=/www/nipaplay-data/music_library_data
```

## Build

```bash
npm ci
npm run build
npm start
```

The server should be placed behind Nginx, with Nginx proxying the domain to the
Next.js process.
