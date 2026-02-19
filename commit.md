# Performance Comparison: cmake-thin-wrapper vs main

## Summary

This branch (`cmake-thin-wrapper`) replaces the node-gyp build system with CMake and introduces several optimizations:
- CMake build with aggressive compiler optimizations (`-O3`, `-ffast-math`, LTO)
- LRU cache for compiled jq filters
- Thin C++ NAPI wrapper

## Benchmark Results

### Small JSON Operations (`.foo` filter on `{foo: 1, bar: "hello"}`)

| Branch | Ops/sec | μs/op | Improvement |
|--------|---------|-------|-------------|
| main | 374,913 | 3 | - |
| cmake-thin-wrapper | 677,983 | 1 | **1.8x faster** |

### Realistic Workload (108k complex queries on 27KB JSON)

Single-process comparison:

| Branch | Time | Ops/sec | Improvement |
|--------|------|---------|-------------|
| main | 46.98s | 2,299 | - |
| cmake-thin-wrapper | 14.19s | 7,609 | **3.3x faster** |

## Multi-Process Scaling (cmake-thin-wrapper only)

Using Node.js `cluster` module for true parallelism:

| Workers | Time | Ops/sec | Notes |
|---------|------|---------|-------|
| 1 | 14.19s | 7,609 | Single process baseline |
| 4 | 4.61s | 23,426 | |
| 6 | 2.96s | 36,503 | |
| 8 | 2.37s | 45,569 | |
| 10 | 2.19s | 49,363 | |
| **12** | **2.12s** | **50,956** | **Optimal** |
| 16 | 2.20s | 49,147 | Diminishing returns |

## Comparison with Go (gojq)

| Implementation | Time (108k ops) | Ops/sec |
|----------------|-----------------|---------|
| Go (gojq) | ~2s | ~54,000 |
| Node.js (main branch, single) | 46.98s | 2,299 |
| Node.js (cmake-thin-wrapper, single) | 14.19s | 7,609 |
| **Node.js (cmake-thin-wrapper, 12 workers)** | **2.12s** | **50,956** |

**Result: Node.js now matches Go performance with multi-process architecture.**

## Key Optimizations

1. **CMake Build System**
   - Replaced node-gyp with cmake-js
   - Enabled `-O3`, `-ffast-math`, `-funroll-loops`, `-ftree-vectorize`
   - Link Time Optimization (LTO) for cross-module inlining
   - Native CPU targeting (`-march=native` / `-mcpu=native`)

2. **LRU Cache for Compiled Filters**
   - Caches compiled jq programs (default: 100 entries)
   - Eliminates recompilation overhead for repeated filters
   - Configurable via `setCacheSize()`

3. **Thin C++ Wrapper**
   - Minimal NAPI binding layer
   - Direct jq library calls without abstraction overhead

## Usage Recommendations

### Single-threaded (simple use cases)
```javascript
const jq = require('@port-labs/jq-node-bindings');
const result = jq.exec(data, '.foo.bar');
```

### Multi-process (high throughput)
```javascript
const cluster = require('cluster');
const jq = require('@port-labs/jq-node-bindings');

if (cluster.isPrimary) {
  // Spawn workers (recommended: CPU cores count)
  for (let i = 0; i < 12; i++) cluster.fork();
} else {
  // Each worker handles requests with full 7k+ ops/sec
  const result = jq.exec(data, filter);
}
```

## Test Environment

- Platform: darwin (macOS)
- Architecture: arm64 (Apple Silicon)
- Node.js: v22.17.0
- CPU: 12 cores
