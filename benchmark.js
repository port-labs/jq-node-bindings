const jq = require('./lib');

const ITERATIONS = 10000;

// Test data
const smallJson = { foo: 1, bar: "hello" };
const mediumJson = {
    users: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `user${i}`,
        email: `user${i}@example.com`,
        active: i % 2 === 0
    }))
};
const largeJson = {
    data: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        values: Array.from({ length: 10 }, (_, j) => j * i),
        metadata: { created: Date.now(), index: i }
    }))
};

// Filters
const simpleFilter = '.foo';
const mediumFilter = '.users | map(select(.active)) | length';
const complexFilter = '.data | map(.values | add) | add';

function benchmark(name, fn, iterations = ITERATIONS) {
    // Warmup
    for (let i = 0; i < 100; i++) fn();

    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const end = process.hrtime.bigint();

    const totalMs = Number(end - start) / 1_000_000;
    const opsPerSec = Math.round(iterations / (totalMs / 1000));
    const avgUs = Math.round((totalMs / iterations) * 1000);

    console.log(`${name.padEnd(45)} ${opsPerSec.toLocaleString().padStart(10)} ops/sec  ${avgUs.toLocaleString().padStart(6)} μs/op`);
    return { name, opsPerSec, avgUs, totalMs };
}

async function benchmarkAsync(name, fn, iterations = ITERATIONS) {
    // Warmup
    for (let i = 0; i < 100; i++) await fn();

    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        await fn();
    }
    const end = process.hrtime.bigint();

    const totalMs = Number(end - start) / 1_000_000;
    const opsPerSec = Math.round(iterations / (totalMs / 1000));
    const avgUs = Math.round((totalMs / iterations) * 1000);

    console.log(`${name.padEnd(45)} ${opsPerSec.toLocaleString().padStart(10)} ops/sec  ${avgUs.toLocaleString().padStart(6)} μs/op`);
    return { name, opsPerSec, avgUs, totalMs };
}

async function main() {
    console.log('='.repeat(75));
    console.log('jq-node-bindings Benchmark');
    console.log('='.repeat(75));
    console.log(`Iterations: ${ITERATIONS.toLocaleString()}\n`);

    console.log('--- Sync Execution (exec) ---\n');

    benchmark('Small JSON + simple filter (.foo)',
        () => jq.exec(smallJson, simpleFilter));

    benchmark('Small JSON + identity (.)',
        () => jq.exec(smallJson, '.'));

    benchmark('Medium JSON (100 users) + filter active',
        () => jq.exec(mediumJson, mediumFilter), 1000);

    benchmark('Large JSON (1000 items) + sum values',
        () => jq.exec(largeJson, complexFilter), 100);

    console.log('\n--- Async Execution (execAsync) ---\n');

    await benchmarkAsync('Small JSON + simple filter (.foo)',
        () => jq.execAsync(smallJson, simpleFilter));

    await benchmarkAsync('Small JSON + identity (.)',
        () => jq.execAsync(smallJson, '.'));

    await benchmarkAsync('Medium JSON (100 users) + filter active',
        () => jq.execAsync(mediumJson, mediumFilter), 1000);

    await benchmarkAsync('Large JSON (1000 items) + sum values',
        () => jq.execAsync(largeJson, complexFilter), 100);

    console.log('\n--- Comparison: Sync vs Async overhead ---\n');

    const syncResult = benchmark('exec() - baseline',
        () => jq.exec(smallJson, '.foo'));

    const asyncResult = await benchmarkAsync('execAsync() - Promise wrapper',
        () => jq.execAsync(smallJson, '.foo'));

    const overhead = ((asyncResult.avgUs - syncResult.avgUs) / syncResult.avgUs * 100).toFixed(1);
    console.log(`\nAsync overhead: ${overhead}% (${asyncResult.avgUs - syncResult.avgUs} μs)\n`);

    console.log('='.repeat(75));
}

main().catch(console.error);
