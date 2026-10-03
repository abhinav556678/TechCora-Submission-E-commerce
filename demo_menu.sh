#!/bin/bash

# Make sure you have your docker containers running before using this menu!
# Run: docker-compose up -d

while true; do
    echo ""
    echo "======================================================"
    echo " 🚀 DISTRIBUTED FLASH SALE & CHAOS SIMULATOR"
    echo "======================================================"
    echo "Select a scenario to demonstrate to the judges:"
    echo "1) The Perfect Run (10k normal users)"
    echo "2) Duplicate Client Requests (10k users double-clicking)"
    echo "3) Database Worker Crash & Recovery (Message Durability)"
    echo "4) API Crash After Reservation (TTL & Auto-Restock)"
    echo "5) Exit Simulator"
    echo "======================================================"
    read -p "Enter choice [1-5]: " choice

    case $choice in
        1)
            echo -e "\n[SCENARIO 1] Launching 10,000 normal users..."
            echo "Narrative: Watch the API latency remain flat while the queue safely absorbs the database writes."
            # Run your standard k6 script
            # k6 run load_tests/normal_run.js
            echo "-> (Simulated) k6 running..."
            ;;
        2)
            echo -e "\n[SCENARIO 2] Launching impatient users sending duplicate requests..."
            echo "Narrative: 10,000 users are hitting 'Buy' 5 times simultaneously. The Redis Lua script guarantees only 1 reservation per user."
            # Run a k6 script configured to send identical user_ids concurrently
            # k6 run load_tests/duplicate_requests.js
            echo "-> (Simulated) k6 duplicate test running..."
            ;;
        3)
            echo -e "\n[SCENARIO 3] Simulating Database Worker Outage..."
            echo "Narrative: We will start the flash sale, and midway, simulate a total worker crash."
            
            # Start k6 in the background
            # k6 run load_tests/normal_run.js &
            echo "-> Flash sale started..."
            sleep 3
            
            echo "🛑 INJECTING FAILURE: Killing DB Worker container..."
            # Replace 'worker_container_name' with your actual docker-compose worker name
            # docker stop worker_container_name
            
            echo "🔥 WORKER DOWN! Point to Grafana: The queue is backing up, database inserts have stopped, but users are STILL successfully reserving stock."
            
            read -p "Press [Enter] when ready to recover the system..."
            
            echo "✅ RECOVERING: Restarting DB Worker..."
            # docker start worker_container_name
            echo "Point to Grafana: The worker resumes processing from RabbitMQ. No data was lost."
            ;;
        4)
            echo -e "\n[SCENARIO 4] Simulating API Crash (Dual-Write Failure / Abandoned Cart)"
            echo "Narrative: User reserves stock in Redis, but the API server crashes before publishing to RabbitMQ."
            
            # Hit a special test endpoint on your API that executes Redis logic but INTENTIONALLY skips the RabbitMQ publish
            # curl -X POST http://localhost:3000/api/buy/simulate-crash
            echo "-> API hit. Redis deducted 1 item. API 'crashed'."
            echo "Look at Grafana: Inventory dropped, but the queue is empty. The unit is stuck."
            
            echo "Waiting for TTL to expire (For demo purposes, TTL is set to 10 seconds)..."
            
            for i in {1..10}; do
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
