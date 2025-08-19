import os
import requests
import json
import re
import time

# --- Configuration ---
OWNER = "MCDFsteve"
REPO = "NipaPlay-Reload"
TARGET_DIRS = ["Documentation", "CONTRIBUTING_GUIDE"]
OUTPUT_JSON = "guides.json"
REQUEST_TIMEOUT = 15 # seconds
RETRY_COUNT = 3
RETRY_DELAY = 5 # seconds

def requests_get_with_retry(url, headers):
    """A wrapper for requests.get that includes a retry mechanism."""
    for i in range(RETRY_COUNT):
        try:
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
            return response
        except requests.exceptions.RequestException as e:
            print(f"Warning: Request to {url} failed (Attempt {i+1}/{RETRY_COUNT}). Retrying in {RETRY_DELAY}s. Error: {e}")
            time.sleep(RETRY_DELAY)
    # If all retries fail, raise the last exception
    raise Exception(f"Failed to fetch {url} after {RETRY_COUNT} attempts.")

def get_md_files_recursively(owner, repo, path):
    files = []
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    headers = {'Accept': 'application/vnd.github.v3+json'}
    try:
        response = requests_get_with_retry(api_url, headers)
        contents = response.json()
        for item in contents:
            if item['type'] == 'dir':
                files.extend(get_md_files_recursively(owner, repo, item['path']))
            elif item['type'] == 'file' and item['name'].endswith('.md'):
                files.append({'path': item['path'], 'url': item['download_url']})
    except Exception as e:
        # This will now catch the final exception from the retry wrapper
        print(f"Error: Could not fetch contents for '{path}'. Details: {e}")
    return files

def get_title_from_md(md_content, fallback_path):
    match = re.search(r'^#\s+(.*)', md_content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    filename = os.path.basename(fallback_path)
    return filename.replace('.md', '').replace('-', ' ').replace('_', ' ')

def convert_md_links(content, current_file_path):
    """Converts relative markdown links (with optional anchors) to absolute anchor links."""
    # This regex now handles an optional anchor (#...) at the end of the link.
    pattern = re.compile(r'\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.md)(#[^)]*)?\)')

    def replacer(match):
        link_text = match.group(1)
        relative_link_target = match.group(2)
        anchor = match.group(3) or '' # Default to empty string if no anchor
        
        current_dir = os.path.dirname(current_file_path)
        absolute_link_path = os.path.normpath(os.path.join(current_dir, relative_link_target))
        
        target_id = os.path.splitext(absolute_link_path.replace('/', '-'))[0]
        
        return f'[{link_text}](#{target_id}{anchor})'

    return pattern.sub(replacer, content)

def fetch_guides_from_github():
    print(f"Starting crawl of repository '{OWNER}/{REPO}'...")
    final_output = {}
    headers = {'Accept': 'application/vnd.github.v3+json'} # Headers for raw content are usually not needed

    for directory in TARGET_DIRS:
        print(f"Crawling directory: '{directory}'...")
        md_files_in_dir = get_md_files_recursively(OWNER, REPO, directory)

        if not md_files_in_dir:
            print(f"No markdown files found in '{directory}'.")
            continue

        print(f"Found {len(md_files_in_dir)} markdown files in '{directory}'.")
        guides_list = []
        for file_info in md_files_in_dir:
            try:
                print(f"  - Processing {file_info['path']}...")
                response = requests_get_with_retry(file_info['url'], headers={}) # No special headers needed for raw download
                md_content = response.text
                
                processed_content = convert_md_links(md_content, file_info['path'])
                
                title = get_title_from_md(processed_content, file_info['path'])
                file_id = os.path.splitext(file_info['path'].replace('/', '-'))[0]

                guides_list.append({
                    'id': file_id,
                    'name': title,
                    'content': processed_content
                })
            except Exception as e:
                print(f"    Error processing {file_info['path']}. Details: {e}")

        # --- Custom Sorting Logic ---
        output_key = directory.lower().replace('-', '_')
        if output_key == 'documentation':
            # Define the desired order for documentation guides
            doc_order = [
                "Documentation-index", "Documentation-quick-start", "Documentation-installation",
                "Documentation-post-install", "Documentation-user-guide", "Documentation-server-integration",
                "Documentation-settings", "Documentation-faq", "Documentation-troubleshooting",
                "Documentation-privacy", "Documentation-release-channels"
            ]
            # Create a mapping from id to its sort order
            order_map = {id_name: i for i, id_name in enumerate(doc_order)}
            # Sort the list using the map. Unlisted items go to the end.
            guides_list.sort(key=lambda g: order_map.get(g['id'], len(doc_order)))
        else:
            # Default sort for other categories like CONTRIBUTING_GUIDE
            guides_list.sort(key=lambda g: g['id'])
        output_key = directory.lower().replace('-', '_')
        final_output[output_key] = guides_list

    try:
        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(final_output, f, ensure_ascii=False, indent=4)
        print(f"\nSuccessfully created {OUTPUT_JSON} with {len(final_output)} categories.")
    except IOError as e:
        print(f"Error writing to {OUTPUT_JSON}: {e}")

if __name__ == "__main__":
    fetch_guides_from_github()
