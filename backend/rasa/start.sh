#!/bin/bash
# Start the Rasa action server in the background and log output
rasa run actions --port 5055 > /app/actions.log 2>&1 &
# Wait a moment for the action server to start
sleep 5
# Start the Rasa main server
rasa run --enable-api --port 5005