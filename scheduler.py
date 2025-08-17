
import time
import subprocess
from datetime import datetime

# --- Configuration ---
FETCH_RELEASES_SCRIPT = "/www/wwwroot/nipaplay.aimes-soft.com/fetch_releases.py"
CACHE_ASSETS_SCRIPT = "/www/wwwroot/nipaplay.aimes-soft.com/cache_assets.sh"
PYTHON_EXECUTABLE = "/root/.pyenv/shims/python3"  # The path we found earlier

# Run every 2 hours (in seconds)
FETCH_RELEASES_INTERVAL = 2 * 60 * 60
# Run every 24 hours (in seconds)
CACHE_ASSETS_INTERVAL = 24 * 60 * 60

def run_command(command):
    """Runs a command and prints its output with timestamps."""
    print(f"--- [{datetime.now()}] Running command: {' '.join(command)} ---")
    try:
        # Using subprocess.run to wait for the command to complete
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False, # Do not raise exception on non-zero exit, we'll log it
            encoding='utf-8'
        )
        
        # Print stdout
        if result.stdout:
            print(result.stdout)
        
        # Print stderr if it exists
        if result.stderr:
            print("--- Stderr ---")
            print(result.stderr)
            
        if result.returncode != 0:
            print(f"!!! WARNING: Command finished with a non-zero exit code: {result.returncode} !!!")

    except FileNotFoundError:
        print(f"!!! ERROR: Command not found: {command[0]}. Please check the path. !!!")
    except Exception as e:
        print(f"!!! An unexpected error occurred: {e} !!!")
    
    print(f"--- [{datetime.now()}] Finished command: {' '.join(command)} ---")

def main():
    """Main loop to run tasks at their scheduled intervals."""
    print(f"--- [{datetime.now()}] Starting Master Scheduler Script ---")
    # Initialize last run times to a long time ago to ensure they run on the first iteration
    last_fetch_run = 0
    last_cache_run = 0

    while True:
        current_time = time.time()

        # Check if it's time to run fetch_releases.py
        if current_time - last_fetch_run >= FETCH_RELEASES_INTERVAL:
            run_command([PYTHON_EXECUTABLE, FETCH_RELEASES_SCRIPT])
            last_fetch_run = current_time

        # Check if it's time to run cache_assets.sh
        if current_time - last_cache_run >= CACHE_ASSETS_INTERVAL:
            run_command(["bash", CACHE_ASSETS_SCRIPT])
            last_cache_run = current_time

        # Sleep for a minute before checking again
        time.sleep(60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n--- [{datetime.now()}] Scheduler script stopped by user. ---")
