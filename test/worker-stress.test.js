/**
 * Worker thread stress test for jq bindings
 * Tests if the global LRU cache causes issues when used from multiple worker threads
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

// Worker code - runs jq.exec in a separate thread
if (!isMainThread) {
    const jq = require('../lib');
    const { iterations, testJson, filter, workerId } = workerData;

    const results = [];
    const errors = [];

    for (let i = 0; i < iterations; i++) {
        try {
            const result = jq.exec(testJson, filter);
            results.push(result);
        } catch (err) {
            errors.push({ iteration: i, error: err.message });
        }
    }

    parentPort.postMessage({ workerId, results, errors });
}

// Main thread test code
if (isMainThread) {
    describe('jq worker thread stress tests', () => {
        const WORKER_COUNT = 8;
        const ITERATIONS_PER_WORKER = 500;
        const testJson = { foo: 'bar', nested: { value: 123, items: [1, 2, 3] } };
        const expectedResult = 'bar';

        function runWorker(workerId, filter) {
            return new Promise((resolve, reject) => {
                const worker = new Worker(__filename, {
                    workerData: {
                        iterations: ITERATIONS_PER_WORKER,
                        testJson,
                        filter,
                        workerId
                    }
                });

                worker.on('message', resolve);
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker ${workerId} stopped with exit code ${code}`));
                    }
                });
            });
        }

        it('should handle multiple workers using the same filter (cached)', async () => {
            const filter = '.foo';

            console.log(`\nStarting ${WORKER_COUNT} workers, each running ${ITERATIONS_PER_WORKER} iterations...`);

            const workerPromises = [];
            for (let i = 0; i < WORKER_COUNT; i++) {
                workerPromises.push(runWorker(i, filter));
            }

            const results = await Promise.all(workerPromises);

            let totalResults = 0;
            let totalErrors = 0;
            let inconsistentResults = 0;

            results.forEach(({ workerId, results: workerResults, errors }) => {
                totalResults += workerResults.length;
                totalErrors += errors.length;

                workerResults.forEach((result, idx) => {
                    if (result !== expectedResult) {
                        inconsistentResults++;
                        if (inconsistentResults <= 5) {
                            console.log(`  Worker ${workerId}, iteration ${idx}: expected "${expectedResult}", got "${result}"`);
                        }
                    }
                });

                if (errors.length > 0) {
                    console.log(`  Worker ${workerId} had ${errors.length} errors`);
                    errors.slice(0, 3).forEach(e => console.log(`    - Iteration ${e.iteration}: ${e.error}`));
                }
            });

            console.log(`\nResults:`);
            console.log(`  Total executions: ${totalResults}`);
            console.log(`  Total errors: ${totalErrors}`);
            console.log(`  Inconsistent results: ${inconsistentResults}`);

            expect(totalErrors).toBe(0);
            expect(inconsistentResults).toBe(0);
        }, 60000);

        it('should handle multiple workers with different filters', async () => {
            const filters = [
                { filter: '.foo', expected: 'bar' },
                { filter: '.nested.value', expected: 123 },
                { filter: '.nested.items | length', expected: 3 },
                { filter: '.nested.items[0]', expected: 1 },
            ];

            console.log(`\nStarting ${WORKER_COUNT} workers with different filters...`);

            const workerPromises = [];
            for (let i = 0; i < WORKER_COUNT; i++) {
                const { filter, expected } = filters[i % filters.length];
                workerPromises.push(
                    runWorker(i, filter).then(result => ({ ...result, expected }))
                );
            }

            const results = await Promise.all(workerPromises);

            let totalResults = 0;
            let totalErrors = 0;
            let inconsistentResults = 0;

            results.forEach(({ workerId, results: workerResults, errors, expected }) => {
                totalResults += workerResults.length;
                totalErrors += errors.length;

                workerResults.forEach((result, idx) => {
                    if (result !== expected) {
                        inconsistentResults++;
                        if (inconsistentResults <= 5) {
                            console.log(`  Worker ${workerId}, iteration ${idx}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`);
                        }
                    }
                });
            });

            console.log(`\nResults:`);
            console.log(`  Total executions: ${totalResults}`);
            console.log(`  Total errors: ${totalErrors}`);
            console.log(`  Inconsistent results: ${inconsistentResults}`);

            expect(totalErrors).toBe(0);
            expect(inconsistentResults).toBe(0);
        }, 60000);

        it('should handle rapid worker creation and destruction', async () => {
            const ROUNDS = 10;
            const WORKERS_PER_ROUND = 4;
            const ITERATIONS = 100;

            console.log(`\nRunning ${ROUNDS} rounds of ${WORKERS_PER_ROUND} workers each...`);

            let totalErrors = 0;
            let totalInconsistent = 0;

            for (let round = 0; round < ROUNDS; round++) {
                const workerPromises = [];
                for (let i = 0; i < WORKERS_PER_ROUND; i++) {
                    workerPromises.push(
                        new Promise((resolve, reject) => {
                            const worker = new Worker(__filename, {
                                workerData: {
                                    iterations: ITERATIONS,
                                    testJson,
                                    filter: '.foo',
                                    workerId: round * WORKERS_PER_ROUND + i
                                }
                            });
                            worker.on('message', resolve);
                            worker.on('error', reject);
                        })
                    );
                }

                const results = await Promise.all(workerPromises);

                results.forEach(({ results: workerResults, errors }) => {
                    totalErrors += errors.length;
                    workerResults.forEach(result => {
                        if (result !== expectedResult) totalInconsistent++;
                    });
                });
            }

            console.log(`\nResults:`);
            console.log(`  Total rounds: ${ROUNDS}`);
            console.log(`  Total errors: ${totalErrors}`);
            console.log(`  Inconsistent results: ${totalInconsistent}`);

            expect(totalErrors).toBe(0);
            expect(totalInconsistent).toBe(0);
        }, 120000);
    });
}
