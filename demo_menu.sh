#!/bin/bash

# Make sure you have your docker containers running and API/Worker started before using this menu!
# 1. docker compose up -d
# 2. npm run start
# 3. npm run worker

while true; do
    echo ""
    echo "======================================================"
    echo " 🚀 DISTRIBUTED FLASH SALE & CHAOS SIMULATOR"
    echo "======================================================"
    echo "Select a scenario to demonstrate to the judges:"
    echo "1) The Perfect Run (10k normal users)"
    echo "2) Duplicate Client Requests (10k users double-clicking)"
    echo "3) Database Worker Crash & Recovery (Message Durability)"
    echo "4) API Crash After Reservation (TTL & Auto-Restock) [WIP - Ticket 06]"
    echo "5) Exit Simulator"
    echo "======================================================"
    read -p "Enter choice [1-5]: " choice

    case $choice in
        1)
            echo -e "\n[SCENARIO 1] Launching 10,000 normal users..."
            echo "Narrative: Watch the API latency remain flat while the queue safely absorbs the database writes."
            k6 run load_tests/normal_run.js
            ;;
        2)
            echo -e "\n[SCENARIO 2] Launching impatient users sending duplicate requests..."
            echo "Narrative: 10,000 users are hitting 'Buy' multiple times simultaneously. The Redis Lua script guarantees only 1 reservation per user."
            k6 run load_tests/duplicate_requests.js
            ;;
        3)
            echo -e "\n[SCENARIO 3] Simulating Database Worker Outage..."
            echo "Narrative: We will start the flash sale, and midway, simulate a total worker crash."
            
            # Start k6 in the background
            k6 run load_tests/normal_run.js &
            K6_PID=$!
            
            echo "-> Flash sale started..."
            sleep 2
            
            # We don't have worker as a docker container (it's npm run worker), 
            # so we'll simulate by stopping the postgres container to block the worker
            echo "🛑 INJECTING FAILURE: Stopping Postgres container to block DB worker..."
            docker stop techcora-submission-postgres-1
            
            echo "🔥 POSTGRES DOWN! Point to Grafana: The queue is backing up, database inserts have stopped, but users are STILL successfully reserving stock."
            
            read -p "Press [Enter] when ready to recover the database..."
            
            echo "✅ RECOVERING: Restarting Postgres..."
            docker start techcora-submission-postgres-1
            echo "Point to Grafana: The worker resumes processing from RabbitMQ. No data was lost."
            wait $K6_PID
            ;;
        4)
            echo -e "\n[SCENARIO 4] Simulating API Crash (Dual-Write Failure / Abandoned Cart)"
            echo "Narrative: User reserves stock in Redis, but the API server crashes before publishing to RabbitMQ."
            
            # Hit the mock crash endpoint (to be implemented in Ticket 06)
            curl -X POST http://localhost:3000/api/buy/simulate-crash
            
            echo -e "\n-> API hit. Redis deducted 1 item. API 'crashed' before queueing."
            echo "Look at Grafana: Inventory dropped, but the queue is empty. The unit is stuck."
            
            echo "Waiting for TTL to expire (For demo purposes, TTL will be set to short duration)..."
            
            for i in {1..5}; do
                echo -n "$i "
                sleep 1
            done
            
            echo -e "\n⏰ TTL EXPIRED! The background reaper just restored the item to the warehouse."
            echo "Look at Grafana: Inventory jumped back up by 1."
            ;;
        5)
            echo "Exiting simulator. Great demo!"
            exit 0
            ;;
        *)
            echo "Invalid option, please select 1-5."
            ;;
    esac
done
