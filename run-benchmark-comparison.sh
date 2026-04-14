#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
MAIN_BRANCH="main"
MEMORY_LIMIT="2g"
CPU_LIMIT="2"
REPO_URL="https://github.com/port-labs/jq-node-bindings.git"

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}JQ Node Bindings Benchmark Comparison${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Current branch: $CURRENT_BRANCH"
echo "Comparing against: $MAIN_BRANCH"
echo "Memory limit: $MEMORY_LIMIT"
echo "CPU limit: $CPU_LIMIT cores"
echo ""

# Build main branch
echo -e "${YELLOW}Building Docker image for $MAIN_BRANCH branch...${NC}"
docker build \
    --build-arg BRANCH=$MAIN_BRANCH \
    --build-arg REPO_URL=$REPO_URL \
    -t jq-benchmark:main .

# Build current branch
echo -e "${YELLOW}Building Docker image for $CURRENT_BRANCH branch...${NC}"
docker build \
    --build-arg BRANCH=$CURRENT_BRANCH \
    --build-arg REPO_URL=$REPO_URL \
    -t jq-benchmark:current .

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Running Benchmarks${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Run benchmark for main branch
echo -e "${YELLOW}Running benchmark for $MAIN_BRANCH branch...${NC}"
echo -e "${GREEN}--- MAIN BRANCH RESULTS ---${NC}"
docker run --rm \
    --memory=$MEMORY_LIMIT \
    --cpus=$CPU_LIMIT \
    jq-benchmark:main

echo ""
echo ""

# Run benchmark for current branch
echo -e "${YELLOW}Running benchmark for $CURRENT_BRANCH branch...${NC}"
echo -e "${GREEN}--- CURRENT BRANCH ($CURRENT_BRANCH) RESULTS ---${NC}"
docker run --rm \
    --memory=$MEMORY_LIMIT \
    --cpus=$CPU_LIMIT \
    jq-benchmark:current

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Benchmark Comparison Complete${NC}"
echo -e "${GREEN}============================================${NC}"
