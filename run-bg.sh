#!/bin/bash
cd "$(dirname "$0")"
git pull
npm i
node index.js >stable.log 2>&1 &
