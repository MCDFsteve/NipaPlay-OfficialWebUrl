#!/bin/bash

# This script intelligently downloads remote assets for the NipaPlay website,
# converts them to WebP format, and stores them locally.

# Set the absolute path for the assets directory
ASSET_DIR="/www/wwwroot/nipaplay.aimes-soft.com/assets"
FFMPEG_PATH="/usr/bin/ffmpeg"

# Ensure the directory exists
mkdir -p "$ASSET_DIR"

# List of assets to download
# Format: "<local_filename> <remote_url>"
ASSETS_TO_CACHE=(
    "icon.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/icon.png"
    "logo.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/assets/logo.png"
    "hero_main.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E4%B8%BB%E9%A1%B5.png"
    "feature_media_library.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E5%AA%92%E4%BD%93%E5%BA%93%E7%95%8C%E9%9D%A2.png"
    "feature_playback_ui.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E6%92%AD%E6%94%BE%E7%95%8C%E9%9D%A2-UI%E5%B1%95%E7%A4%BA.png"
    "feature_streaming.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E6%B5%81%E5%AA%92%E4%BD%93%E8%AF%A6%E6%83%85%E9%A1%B5%E9%9D%A2.png"
    "feature_mobile.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E4%B8%BB%E9%A1%B5-%E6%89%8B%E6%9C%BA.png"
    "gallery_series_list.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E5%89%A7%E9%9B%86%E5%88%97%E8%A1%A8%E7%95%8C%E9%9D%A2.png"
    "gallery_series_details.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E6%96%B0%E7%95%AA%E8%AF%A6%E6%83%85%E7%95%8C%E9%9D%A2.png"
    "gallery_library_management.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E5%BA%93%E7%AE%A1%E7%90%86%E7%95%8C%E9%9D%A2.png"
    "gallery_streaming_library.png https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/others/%E6%B5%81%E5%AA%92%E4%BD%93%E5%AA%92%E4%BD%93%E5%BA%93.png"
)

echo "--- Starting Smart Asset Caching ---"

for asset in "${ASSETS_TO_CACHE[@]}"; do
    # Split the string into filename and URL
    read -r filename url <<<"$asset"
    
    local_path="$ASSET_DIR/$filename"
    # Gsub to replace .png with .webp at the end of the string
    webp_path="${local_path%.png}.webp"

    echo "Processing $filename..."

    # Use curl's time condition feature. It will only download if the remote file is newer than the local one.
    # -s: silent, -L: follow redirects, -z: time condition, -o: output, --fail: fail silently on server errors
    curl -s -L --fail -z "$local_path" -o "$local_path" "$url"
    CURL_EXIT_CODE=$?

    # Exit code 22 means the remote file is not newer. 0 means it was downloaded.
    if [ $CURL_EXIT_CODE -eq 0 ]; then
        echo " -> Downloaded new version of $filename."
    elif [ $CURL_EXIT_CODE -ne 22 ]; then
        echo " -> Failed to download $filename with curl exit code $CURL_EXIT_CODE."
        continue # Skip to next asset
    fi

    # Convert to WebP if the original file is newer than the WebP version, or if WebP doesn't exist.
    if [ -f "$local_path" ] && { [ ! -f "$webp_path" ] || [ "$local_path" -nt "$webp_path" ]; }; then
        echo " -> Converting $filename to WebP format..."
        "$FFMPEG_PATH" -i "$local_path" -hide_banner -loglevel error -c:v libwebp -quality 85 -y "$webp_path"
        
        if [ $? -eq 0 ]; then
            echo " -> Conversion successful."
            # Optional: remove the original file after successful conversion
            rm "$local_path"
            echo " -> Removed original: $filename"
        else
            echo " -> ERROR: Failed to convert $filename."
        fi
    else
        echo " -> WebP version is already up-to-date."
    fi
done

echo "--- Asset Caching Finished ---"
