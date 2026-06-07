import subprocess
import time

def main():
    # Start the action server in the background
    action = subprocess.Popen(["rasa", "run", "actions", "--port", "5055"])
    # Give it a moment to start
    time.sleep(5)
    # Start the main Rasa server
    main = subprocess.Popen(["rasa", "run", "--enable-api", "--port", "5005"])
    # Keep the container alive
    try:
        action.wait()
        main.wait()
    except KeyboardInterrupt:
        action.terminate()
        main.terminate()

if __name__ == "__main__":
    main()