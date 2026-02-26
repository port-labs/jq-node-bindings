FROM node:20-bookworm

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    autoconf \
    automake \
    libtool \
    git \
    flex \
    bison \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone the repository with submodules
ARG REPO_URL=https://github.com/port-labs/jq-node-bindings.git
ARG BRANCH=main

RUN git clone --recursive --branch ${BRANCH} ${REPO_URL} . || \
    (git clone ${REPO_URL} . && git checkout ${BRANCH} && git submodule update --init --recursive)

# Copy benchmark.js from build context (overrides the one in repo)
COPY benchmark.js ./benchmark.js

# Install npm dependencies
RUN npm install --ignore-scripts

# Build the native addon (supports both node-gyp and cmake-js)
RUN if [ -f "CMakeLists.txt" ]; then \
        npx cmake-js rebuild; \
    else \
        npx node-gyp rebuild; \
    fi

# Default command runs the benchmark
CMD ["node", "benchmark.js"]
