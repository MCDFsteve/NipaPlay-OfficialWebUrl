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