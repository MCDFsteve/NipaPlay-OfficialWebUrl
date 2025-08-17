<<<<<<< HEAD
# NipaPlay 官方网站

本项目是 [NipaPlay 媒体播放器](https://github.com/MCDFsteve/NipaPlay-Reload) 的官方网站源码，用于功能展示与软件下载。

## 网站功能

- **现代化的设计**：采用流畅的动画与日间/夜间双色主题，提供舒适的浏览体验。
- **功能特性展示**：图文并茂地介绍 NipaPlay 的核心功能，如强大的媒体中心、沉浸式播放体验、在线流媒体支持等。
- **软件截图画廊**：直观地展示软件在不同场景下的界面截图。
- **自动更新的下载**：网站的下载链接与版本号信息，通过后台脚本与主项目实时同步，永远保持最新。

## 自动化系统

本网站后台带有一套完整的自动化管理脚本，实现了与主项目的持续集成。

- **核心脚本**:
    - `scheduler.py`: 主调度脚本，用于替代 Cron，在 `tmux` 中持久化运行，并根据预设的时间间隔（版本检查每2小时，图片缓存每24小时）调用其他子脚本。
    - `fetch_releases.py`: 全能同步脚本，负责拉取/推送 Git 变动、从上游仓库检查和下载最新版 NipaPlay、更新 `releases.json` 清单。
    - `cache_assets.sh`: 智能图片缓存脚本，负责将官网图片下载并转换为 WebP 格式，且支持基于文件修改时间的增量更新，避免重复下载。

## 如何运行

自动化系统通过在 `tmux` 中启动 `scheduler.py` 来运行。

```bash
# 进入项目目录
cd /www/wwwroot/nipaplay.aimes-soft.com

# 创建一个名为 nipaplay_scheduler 的新 tmux 会话，并在其中启动调度器
tmux new -s nipaplay_scheduler "/root/.pyenv/shims/python3 /www/wwwroot/nipaplay.aimes-soft.com/scheduler.py"
```

启动后，可使用 `Ctrl+b` 然后 `d` 的组合键安全地从会话中分离，脚本将在后台持续运行。
=======
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
>>>>>>> ea320f22b011bc90651cf1b265f1b84a04730aa1
