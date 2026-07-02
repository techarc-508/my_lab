#!/bin/bash
set -e

echo "=== NEOTOKYO FM — Codespaces Setup ==="

# Install FFmpeg
sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg

# Server (Flask + gunicorn)
echo ">>> Setting up Server..."
cd /workspaces/$(basename $(pwd))/server
pip install -r requirements.txt

# Client (React frontend)
echo ">>> Setting up Client..."
cd /workspaces/$(basename $(pwd))/client
npm install

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start the services, run:"
echo "  Terminal 1: cd server && gunicorn -c gunicorn.conf.py app:create_app()"
echo "  Terminal 2: cd client && npm run dev"
echo ""
echo "Then open http://localhost:3000 for the Client UI."
echo "The server API will be at http://localhost:5050."
