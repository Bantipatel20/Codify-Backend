#!/bin/bash

API_URL="http://localhost:5000/compile"
CONCURRENT=100
TOTAL_REQUESTS=100

echo "🚀 Starting load test with $CONCURRENT concurrent requests..."
echo "📊 Total requests: $TOTAL_REQUESTS"
echo "🎯 Target: $API_URL"

# Create test data
TEST_DATA='{"code":"print(\"Hello from load test!\")\nimport time\nprint(f\"Current time: {time.time()}\")","lang":"python"}'

# Function to make a single request
make_request() {
    local id=$1
    local start_time=$(date +%s%3N)
    
    response=$(curl -s -w "\n%{http_code}\n%{time_total}" -X POST \
        -H "Content-Type: application/json" \
        -d "$TEST_DATA" \
        "$API_URL" 2>/dev/null)
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    # Parse response
    local http_code=$(echo "$response" | tail -n 2 | head -n 1)
    local curl_time=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | head -n -2)
    
    echo "Request $id: HTTP $http_code, Time: ${response_time}ms"
    
    # Return results for aggregation
    echo "$id,$http_code,$response_time,$curl_time" >> /tmp/load_test_results.txt
}

# Clear previous results
rm -f /tmp/load_test_results.txt
echo "id,http_code,response_time,curl_time" > /tmp/load_test_results.txt

# Start timer
start_time=$(date +%s)

# Launch concurrent requests
for i in $(seq 1 $TOTAL_REQUESTS); do
    make_request $i &
    
    # Limit concurrent processes
    if (( i % CONCURRENT == 0 )); then
        wait
    fi
done

# Wait for remaining processes
wait

# End timer
end_time=$(date +%s)
total_time=$((end_time - start_time))

echo "✅ Load test completed in ${total_time}s"

# Analyze results
echo "📊 RESULTS ANALYSIS:"
echo "==================="

# Count status codes
echo "Status Code Distribution:"
awk -F',' 'NR>1 {count[$2]++} END {for (code in count) print code": "count[code]" requests"}' /tmp/load_test_results.txt

# Calculate response time stats
echo -e "\nResponse Time Statistics:"
awk -F',' 'NR>1 {sum+=$3; if(min==""){min=max=$3}; if($3>max){max=$3}; if($3<min){min=$3}; times[NR-1]=$3} END {
    avg=sum/(NR-1); 
    print "Average: "avg"ms"; 
    print "Min: "min"ms"; 
    print "Max: "max"ms";
    print "Total requests: "(NR-1);
    print "Requests per second: "int((NR-1)/('$total_time'))
}' /tmp/load_test_results.txt

echo -e "\nRaw results saved to: /tmp/load_test_results.txt"
