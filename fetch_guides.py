import requests
import json
import re

# The list of markdown files to fetch from the GitHub repository
GUIDE_FILES = [
    "00-Introduction.md",
    "01-Environment-Setup.md",
    "02-Project-Structure.md",
    "03-How-To-Contribute.md",
    "04-Coding-Style.md",
    "05-Example-Add-A-New-Page.md",
    "06-FAQ.md",
    "07-Theme-Development.md",
    "08-Adding-a-New-Player-Kernel.md",
    "09-Adding-a-New-Danmaku-Kernel.md",
    "10-Platform-Specific-Development.md",
    "11-Non-Coding-Contributions.md"
]

# The base URL for the raw content of the markdown files
BASE_URL = "https://raw.githubusercontent.com/MCDFsteve/NipaPlay-Reload/main/CONTRIBUTING_GUIDE/"

def extract_title_from_md(content):
    """Extracts the first H1 title from markdown content."""
    first_line = content.split('\n', 1)[0]
    if first_line.startswith('# '):
        return first_line[2:].strip()
    return None

def convert_md_links(content):
    """Converts relative markdown links to local anchor links."""
    # This regex finds links like [text](XX-some-file.md)
    pattern = re.compile(r'\[([^\]]+)\]\(((\d+)-[^\])]+\.md)\)')

    def replacer(match):
        link_text = match.group(1)
        guide_id = match.group(3)
        # Return the new link format [text](#ID)
        return f'[{link_text}](#{guide_id})'

    return pattern.sub(replacer, content)

def fetch_guides():
    """
    Fetches the contribution guide markdown files from the GitHub repository
    and saves them as a JSON file.
    """
    guides = []
    for filename in GUIDE_FILES:
        try:
            response = requests.get(f"{BASE_URL}{filename}")
            response.raise_for_status()  # Raise an exception for bad status codes
            content = response.text
            
            title = extract_title_from_md(content)
            if not title:
                title = filename.replace(".md", "").split("-", 1)[1].replace("-", " ")

            # Convert internal links before saving
            processed_content = convert_md_links(content)

            guides.append({
                "id": filename.split("-", 1)[0],
                "name": title,
                "content": processed_content
            })
            print(f"Successfully fetched and processed {filename}")
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {filename}: {e}")
            continue

    # Sort guides by ID
    guides.sort(key=lambda g: g['id'])

    # Write the collected guides to a JSON file
    try:
        with open("guides.json", "w", encoding="utf-8") as f:
            json.dump(guides, f, ensure_ascii=False, indent=4)
        print("Successfully created guides.json")
    except IOError as e:
        print(f"Error writing to guides.json: {e}")

if __name__ == "__main__":
    fetch_guides()


