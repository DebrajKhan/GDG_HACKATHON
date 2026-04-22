import sys
import os

# Add the user site-packages to sys.path
user_site = os.path.expanduser("~\\AppData\\Roaming\\Python\\Python314\\site-packages")
if user_site not in sys.path:
    sys.path.insert(0, user_site)

import uvicorn
from main import app

if __name__ == "__main__":
    print(f"Starting server with sys.path including: {user_site}")
    uvicorn.run(app, host="127.0.0.1", port=8000)
