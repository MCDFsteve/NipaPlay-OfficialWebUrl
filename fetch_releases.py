
import requests
import os
import json

# Configuration
GITHUB_API_URL = "https://api.github.com/repos/MCDFsteve/NipaPlay-Reload/releases/latest"
RELEASES_DIR = "/www/wwwroot/nipaplay.aimes-soft.com/releases"
JSON_OUTPUT_PATH = "/www/wwwroot/nipaplay.aimes-soft.com/releases.json"

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

def main():
    """Main function to fetch and manage releases."""
    print("--- Starting NipaPlay Release Sync ---")

    # 1. Fetch latest release info from GitHub
    try:
        print("Fetching latest release information from GitHub...")
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
        return

    # 2. Check local version from releases.json
    local_version = None
    if os.path.exists(JSON_OUTPUT_PATH):
        try:
            with open(JSON_OUTPUT_PATH, 'r', encoding='utf-8') as f:
                local_data = json.load(f)
                if local_data and isinstance(local_data, list) and local_data[0].get('version'):
                    local_version = local_data[0]['version']
                    print(f"Current local version is: {local_version}")
                else:
                    print("Warning: Local releases.json is malformed or empty.")
        except (IOError, json.JSONDecodeError, IndexError) as e:
            print(f"Warning: Could not read or parse local releases.json: {e}. Will proceed as if no local version exists.")

    # 3. Compare versions and decide whether to proceed
    if remote_version == local_version:
        print("Result: Local version is already up-to-date. No action needed.")
        print("--- Sync Finished ---")
        return

    print(f"Action: New version found (local: {local_version} -> remote: {remote_version}). Starting update process.")

    # 4. Record existing files for cleanup later
    try:
        if not os.path.exists(RELEASES_DIR):
            os.makedirs(RELEASES_DIR)
        old_files = set(os.listdir(RELEASES_DIR))
        print(f"Found {len(old_files)} existing files for potential cleanup.")
    except OSError as e:
        print(f"Error: Could not access releases directory: {e}")
        return

    assets = release_data.get("assets", [])
    if not assets:
        print("Error: No assets found in the latest release on GitHub.")
        return

    print(f"Found {len(assets)} assets for version {remote_version}. Downloading now...")

    new_release_manifest = []
    newly_downloaded_files = set()

    # 5. Download all assets for the new version
    for asset in assets:
        asset_url = asset.get("browser_download_url")
        asset_name = asset.get("name")
        if not asset_url or not asset_name:
            continue

        local_path = os.path.join(RELEASES_DIR, asset_name)
        print(f"Downloading {asset_name}...")
        try:
            with requests.get(asset_url, stream=True, timeout=120) as r: # Increased timeout for large files
                r.raise_for_status()
                with open(local_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            print(f" -> Successfully downloaded {asset_name}")
            newly_downloaded_files.add(asset_name)

            os_name, os_icon = get_os_details(asset_name)
            new_release_manifest.append({
                "name": asset_name,
                "version": remote_version,
                "os": os_name,
                "icon": os_icon,
                "path": f"releases/{asset_name}"
            })
        except requests.exceptions.RequestException as e:
            print(f" -> Failed to download {asset_name}: {e}")
        except IOError as e:
            print(f" -> Failed to write {asset_name} to disk: {e}")

    # 6. Write the new manifest file if downloads were successful
    if not newly_downloaded_files:
        print("Error: No assets were successfully downloaded. Aborting update.")
        return
        
    try:
        with open(JSON_OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(new_release_manifest, f, ensure_ascii=False, indent=4)
        print(f"Successfully created new releases.json for version {remote_version}")
    except IOError as e:
        print(f"Error: Could not write to releases.json: {e}")
        return

    # 7. Delete old files that are not part of the new release
    files_to_delete = old_files - newly_downloaded_files
    if files_to_delete:
        print(f"Cleaning up {len(files_to_delete)} old files...")
        for filename in files_to_delete:
            try:
                os.remove(os.path.join(RELEASES_DIR, filename))
                print(f" -> Deleted old file: {filename}")
            except OSError as e:
                print(f" -> Error deleting old file {filename}: {e}")
    else:
        print("No old files needed cleanup.")

    print("Result: Update process completed successfully.")
    print("--- Sync Finished ---")

if __name__ == "__main__":
    main()
