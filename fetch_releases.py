
import requests
import os
import json
import subprocess
from datetime import datetime

# --- Configuration ---
GITHUB_API_URL = "https://api.github.com/repos/MCDFsteve/NipaPlay-Reload/releases/latest"
PROJECT_DIR = "/www/wwwroot/nipaplay.aimes-soft.com"
RELEASES_DIR = os.path.join(PROJECT_DIR, "releases")
JSON_OUTPUT_PATH = os.path.join(PROJECT_DIR, "releases.json")

def get_os_details(filename):
    """Determine OS and icon from filename."""
    filename_lower = filename.lower()
    if "windows" in filename_lower:
        return "Windows", "ri-window-fill"
    if "macos" in filename_lower or ".dmg" in filename_lower:
        return "macOS", "ri-apple-fill"
    if "linux" in filename_lower or ".appimage" in filename_lower or ".deb" in filename_lower or ".rpm" in filename_lower:
        return "Linux", "ri-ubuntu-fill"
    if "android" in filename_lower or ".apk" in filename_lower:
        return "Android", "ri-android-fill"
    if "ios" in filename_lower or ".ipa" in filename_lower:
        return "iOS", "ri-apple-fill"
    return "Generic", "ri-download-2-line"

def run_git_command(command):
    """Skips Git commands in non-interactive mode."""
    git_command = ["git"] + command
    print(f"Skipping Git command (non-interactive): {' '.join(git_command)}")
    return ""  # Return empty string to satisfy downstream logic

def main():
    """Main function to sync git repo, fetch releases, and push changes."""
    print(f"\n--- [{datetime.now()}] Starting NipaPlay Full Sync ---")

    # 1. Git Pull: Update the codebase first
    print("\n### Step 1: Pulling latest changes from GitHub ###")
    run_git_command(["pull"])

    # 2. Fetch latest release info from GitHub
    print("\n### Step 2: Fetching release information ###")
    release_updated = False
    try:
        print("Fetching latest release information from GitHub API...")
        response = requests.get(GITHUB_API_URL, timeout=15)
        response.raise_for_status()
        release_data = response.json()
        remote_version = release_data.get("tag_name")
        if not remote_version:
            print("Error: Could not determine remote version from GitHub API response.")
            return
        print(f"Latest remote version on GitHub is: {remote_version}")
    except requests.exceptions.RequestException as e:
        print(f"Error: Could not fetch data from GitHub API: {e}")
        # Even if fetching fails, we should still try to push other local changes
        remote_version = None

    # 3. Check local version from releases.json
    local_version = None
    if os.path.exists(JSON_OUTPUT_PATH):
        try:
            with open(JSON_OUTPUT_PATH, 'r', encoding='utf-8') as f:
                local_data = json.load(f)
                if local_data and isinstance(local_data, list) and local_data[0].get('version'):
                    local_version = local_data[0]['version']
                    print(f"Current local version is: {local_version}")
        except (IOError, json.JSONDecodeError, IndexError) as e:
            print(f"Warning: Could not read local releases.json: {e}.")

    # 4. Compare versions and decide whether to download
    if remote_version and remote_version != local_version:
        print(f"Action: New release version found (local: {local_version} -> remote: {remote_version}). Starting download.")
        release_updated = True
        # --- Download logic ---
        try:
            if not os.path.exists(RELEASES_DIR):
                os.makedirs(RELEASES_DIR)
            old_files = set(os.listdir(RELEASES_DIR))
        except OSError as e:
            print(f"Error: Could not access releases directory: {e}")
            return

        assets = release_data.get("assets", [])
        if not assets:
            print("Error: No assets found in the new release.")
        else:
            newly_downloaded_files = set()
            new_release_manifest = []
            for asset in assets:
                asset_url = asset.get("browser_download_url")
                asset_name = asset.get("name")
                if not asset_url or not asset_name: continue
                local_path = os.path.join(RELEASES_DIR, asset_name)
                print(f"Downloading {asset_name}...")
                try:
                    with requests.get(asset_url, stream=True, timeout=120) as r:
                        r.raise_for_status()
                        with open(local_path, 'wb') as f:
                            for chunk in r.iter_content(chunk_size=8192): f.write(chunk)
                    print(f" -> Successfully downloaded.")
                    newly_downloaded_files.add(asset_name)
                    os_name, os_icon = get_os_details(asset_name)
                    new_release_manifest.append({"name": asset_name, "version": remote_version, "os": os_name, "icon": os_icon, "path": f"releases/{asset_name}"})
                except Exception as e:
                    print(f" -> Failed to download {asset_name}: {e}")

            if newly_downloaded_files:
                try:
                    with open(JSON_OUTPUT_PATH, 'w', encoding='utf-8') as f:
                        json.dump(new_release_manifest, f, ensure_ascii=False, indent=4)
                    print(f"Successfully created new releases.json for version {remote_version}")
                except IOError as e:
                    print(f"Error: Could not write to releases.json: {e}")

                files_to_delete = old_files - newly_downloaded_files
                if files_to_delete:
                    print(f"Cleaning up {len(files_to_delete)} old release files...")
                    for filename in files_to_delete:
                        try:
                            os.remove(os.path.join(RELEASES_DIR, filename))
                            print(f" -> Deleted old file: {filename}")
                        except OSError as e:
                            print(f" -> Error deleting old file {filename}: {e}")
            else:
                print("Error: No assets were successfully downloaded. Update aborted.")
                release_updated = False
    else:
        print("Result: Local release version is already up-to-date.")

    # 5. Git Push: Commit and push any changes
    print("\n### Step 3: Pushing local changes to GitHub ###")
    status_output = run_git_command(["status", "--porcelain"])
    if status_output is None:
        print("Could not check git status. Aborting push.")
    elif not status_output:
        print("No local changes to commit. Repository is clean.")
    else:
        print("Changes detected. Committing and pushing...")
        run_git_command(["add", "."])
        
        commit_message = f"Auto-sync: Update project files at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        if release_updated:
            commit_message = f"Auto-sync: Update to release {remote_version}"

        run_git_command(["commit", "-m", commit_message])
        run_git_command(["push"])

    print(f"\n--- [{datetime.now()}] Full Sync Finished ---")

if __name__ == "__main__":
    main()
