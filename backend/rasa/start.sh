#!/bin/bash
# Start the Rasa action server in the background
rasa run actions --port 5055 &
# Start the Rasa main server
rasa run --enable-api --port 5005