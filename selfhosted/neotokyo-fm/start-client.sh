#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /mnt/data/projects/mini_radio/client
exec /home/pushpal/.nvm/versions/node/v20.20.2/bin/npm run dev
