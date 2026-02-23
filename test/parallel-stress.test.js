/**
 * Parallel stress test for jq bindings
 * Tests thread safety and caching behavior across multiple workers
 */

const jq = require('../lib');

const PARALLEL_COUNT = 500;
const TEST_DURATION_MS = 60 * 1000; // 1 minute per test
const BATCH_DELAY_MS = 100; // Delay between batches

describe('jq parallel stress tests', () => {
    // Simple filter that should be cached
    const testJson = { foo: 'bar', nested: { value: 123, items: [1, 2, 3] } };
    const simpleFilter = '.foo';
    const expectedSimple = 'bar';

    // More complex filter
    const complexFilter = '.nested.items | map(. * 2) | add';
    const expectedComplex = 12; // (1+2+3) * 2

    // Filter with string operations
    const stringFilter = '.foo + "-suffix"';
    const expectedString = 'bar-suffix';

    it('should handle 500 parallel executions of the same cached filter', async () => {
        const startTime = Date.now();
        let totalExecutions = 0;
        let errors = [];
        let inconsistentResults = [];

        console.log(`\nStarting parallel stress test with ${PARALLEL_COUNT} concurrent executions...`);

        while (Date.now() - startTime < TEST_DURATION_MS) {
            const batch = Array(PARALLEL_COUNT).fill(null).map(async (_, index) => {
                try {
                    const result = await jq.execAsync(testJson, simpleFilter);
                    if (result !== expectedSimple) {
                        inconsistentResults.push({
                            batch: Math.floor(totalExecutions / PARALLEL_COUNT),
                            index,
                            expected: expectedSimple,
                            got: result
                        });
                    }
                    return { success: true, result };
                } catch (err) {
                    errors.push({
                        batch: Math.floor(totalExecutions / PARALLEL_COUNT),
                        index,
                        error: err.message
                    });
                    return { success: false, error: err.message };
                }
            });

            const results = await Promise.all(batch);
            totalExecutions += PARALLEL_COUNT;

            const successful = results.filter(r => r.success).length;
            if (successful !== PARALLEL_COUNT) {
                console.log(`  Batch completed: ${successful}/${PARALLEL_COUNT} successful`);
            }

            // Small delay between batches to simulate realistic load
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`\nStress test completed:`);
        console.log(`  Total executions: ${totalExecutions}`);
        console.log(`  Duration: ${elapsed.toFixed(2)}s`);
        console.log(`  Throughput: ${(totalExecutions / elapsed).toFixed(2)} ops/sec`);
        console.log(`  Errors: ${errors.length}`);
        console.log(`  Inconsistent results: ${inconsistentResults.length}`);

        if (errors.length > 0) {
            console.log(`\nFirst 5 errors:`);
            errors.slice(0, 5).forEach(e => console.log(`  - Batch ${e.batch}, Index ${e.index}: ${e.error}`));
        }

        if (inconsistentResults.length > 0) {
            console.log(`\nFirst 5 inconsistent results:`);
            inconsistentResults.slice(0, 5).forEach(r =>
                console.log(`  - Batch ${r.batch}, Index ${r.index}: expected "${r.expected}", got "${r.got}"`));
        }

        expect(errors.length).toBe(0);
        expect(inconsistentResults.length).toBe(0);
    }, TEST_DURATION_MS + 30000);

    it('should handle mixed filters in parallel without cross-contamination', async () => {
        const startTime = Date.now();
        let totalExecutions = 0;
        let errors = [];
        let inconsistentResults = [];

        const filters = [
            { filter: simpleFilter, expected: expectedSimple },
            { filter: complexFilter, expected: expectedComplex },
            { filter: stringFilter, expected: expectedString },
        ];

        console.log(`\nStarting mixed filter stress test...`);

        while (Date.now() - startTime < TEST_DURATION_MS) {
            const batch = Array(PARALLEL_COUNT).fill(null).map(async (_, index) => {
                const { filter, expected } = filters[index % filters.length];
                try {
                    const result = await jq.execAsync(testJson, filter);
                    if (result !== expected) {
                        inconsistentResults.push({
                            batch: Math.floor(totalExecutions / PARALLEL_COUNT),
                            index,
                            filter,
                            expected,
                            got: result
                        });
                    }
                    return { success: true };
                } catch (err) {
                    errors.push({
                        batch: Math.floor(totalExecutions / PARALLEL_COUNT),
                        index,
                        filter,
                        error: err.message
                    });
                    return { success: false };
                }
            });

            await Promise.all(batch);
            totalExecutions += PARALLEL_COUNT;

            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`\nMixed filter stress test completed:`);
        console.log(`  Total executions: ${totalExecutions}`);
        console.log(`  Duration: ${elapsed.toFixed(2)}s`);
        console.log(`  Throughput: ${(totalExecutions / elapsed).toFixed(2)} ops/sec`);
        console.log(`  Errors: ${errors.length}`);
        console.log(`  Inconsistent results: ${inconsistentResults.length}`);

        if (errors.length > 0) {
            console.log(`\nFirst 5 errors:`);
            errors.slice(0, 5).forEach(e =>
                console.log(`  - Batch ${e.batch}, Index ${e.index}, Filter "${e.filter}": ${e.error}`));
        }

        if (inconsistentResults.length > 0) {
            console.log(`\nFirst 5 inconsistent results:`);
            inconsistentResults.slice(0, 5).forEach(r =>
                console.log(`  - Batch ${r.batch}, Index ${r.index}, Filter "${r.filter}": expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.got)}`));
        }

        expect(errors.length).toBe(0);
        expect(inconsistentResults.length).toBe(0);
    }, TEST_DURATION_MS + 30000);

    it('should maintain cache consistency under heavy parallel load', async () => {
        const iterations = 10;
        const parallelPerIteration = 500;
        let allResults = [];
        let errors = [];

        console.log(`\nTesting cache consistency: ${iterations} iterations x ${parallelPerIteration} parallel...`);

        for (let i = 0; i < iterations; i++) {
            const batch = Array(parallelPerIteration).fill(null).map(async () => {
                try {
                    return await jq.execAsync(testJson, simpleFilter);
                } catch (err) {
                    errors.push(err.message);
                    return null;
                }
            });

            const results = await Promise.all(batch);
            allResults.push(...results);

            // Verify all results in this batch are identical
            const uniqueResults = [...new Set(results.filter(r => r !== null))];
            if (uniqueResults.length !== 1) {
                console.log(`  Iteration ${i}: Found ${uniqueResults.length} unique results: ${JSON.stringify(uniqueResults)}`);
            }
        }

        const validResults = allResults.filter(r => r !== null);
        const uniqueResults = [...new Set(validResults)];

        console.log(`\nCache consistency test completed:`);
        console.log(`  Total results: ${allResults.length}`);
        console.log(`  Valid results: ${validResults.length}`);
        console.log(`  Unique values: ${uniqueResults.length}`);
        console.log(`  Errors: ${errors.length}`);

        expect(uniqueResults.length).toBe(1);
        expect(uniqueResults[0]).toBe(expectedSimple);
        expect(errors.length).toBe(0);
    }, 60000);

    it('should handle rapid sequential + parallel mixed workload', async () => {
        const startTime = Date.now();
        let syncErrors = [];
        let asyncErrors = [];
        let inconsistencies = [];

        console.log(`\nTesting mixed sync/async workload...`);

        while (Date.now() - startTime < TEST_DURATION_MS / 2) {
            // Mix of sync and async operations
            const asyncBatch = Array(100).fill(null).map(async () => {
                try {
                    return await jq.execAsync(testJson, simpleFilter);
                } catch (err) {
                    asyncErrors.push(err.message);
                    return null;
                }
            });

            // Run some sync operations while async batch is running
            for (let i = 0; i < 50; i++) {
                try {
                    const syncResult = jq.exec(testJson, simpleFilter);
                    if (syncResult !== expectedSimple) {
                        inconsistencies.push({ type: 'sync', expected: expectedSimple, got: syncResult });
                    }
                } catch (err) {
                    syncErrors.push(err.message);
                }
            }

            const asyncResults = await Promise.all(asyncBatch);
            asyncResults.forEach(result => {
                if (result !== null && result !== expectedSimple) {
                    inconsistencies.push({ type: 'async', expected: expectedSimple, got: result });
                }
            });

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log(`\nMixed workload test completed:`);
        console.log(`  Sync errors: ${syncErrors.length}`);
        console.log(`  Async errors: ${asyncErrors.length}`);
        console.log(`  Inconsistencies: ${inconsistencies.length}`);

        expect(syncErrors.length).toBe(0);
        expect(asyncErrors.length).toBe(0);
        expect(inconsistencies.length).toBe(0);
    }, TEST_DURATION_MS + 30000);
});
