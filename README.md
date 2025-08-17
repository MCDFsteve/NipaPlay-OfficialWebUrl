# NipaPlay Official Website

This repository contains the source code for the official website of the NipaPlay media player.

The website serves as a download portal and feature showcase, and is designed to be highly automated.

## Key Features

- **Automated Release Sync:** The website automatically fetches the latest release information and binaries from the [NipaPlay-Reload](https://github.com/MCDFsteve/NipaPlay-Reload) repository.
- **Dynamic Frontend:** The homepage and download modal are dynamically populated with the latest version number and download links. No hardcoding is required.
- **Image Optimization:** All website assets (`.png` images) are automatically downloaded, converted to the modern `.webp` format for faster loading, and cached locally. The caching script only downloads assets if the remote version is newer.
- **Git Integration:** The entire update process is wrapped with Git commands. The script automatically pulls the latest changes from this repository before running, and pushes back any updates (like a new `releases.json`) after a successful run.

## How It Works

The automation is handled by a set of scripts:

- `scheduler.py`: The master scheduler script. This is the only script that needs to be run manually. It is designed to be run in a persistent session (e.g., using `tmux`) and acts as a replacement for system cron jobs. It orchestrates the execution of the other scripts at defined intervals:
    - `fetch_releases.py`: Every 2 hours.
    - `cache_assets.sh`: Every 24 hours.

- `fetch_releases.py`: An all-in-one synchronization script that:
    1.  Pulls the latest changes for this website repository from GitHub.
    2.  Fetches the latest NipaPlay application release from the upstream repository's API.
    3.  Compares versions and downloads new release binaries if available.
    4.  Updates the `releases.json` file.
    5.  Cleans up old release files.
    6.  Commits and pushes the new `releases.json` (if changed) back to this repository.

- `cache_assets.sh`: A shell script that intelligently downloads and caches website images. It only downloads images if the remote version is newer, converts them to `.webp`, and cleans up the originals.

## Running the Automation

To run the automated system, start the master scheduler in a `tmux` session:

```bash
# Navigate to the project directory
cd /www/wwwroot/nipaplay.aimes-soft.com

# Create a new detached tmux session named "nipaplay_scheduler" and run the script
tmux new -s nipaplay_scheduler "/root/.pyenv/shims/python3 /www/wwwroot/nipaplay.aimes-soft.com/scheduler.py"
```

You can detach from the session using `Ctrl+b` then `d`. The script will continue to run in the background.
