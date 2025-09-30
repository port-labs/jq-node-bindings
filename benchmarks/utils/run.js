const { setTimeout } = require("node:timers/promises");
const { logResult, logTitle } = require("./log.js");
const { measureSync, measureAsync } = require("./measure.js");

const BENCHMARK_REPEAT = 100;
const DELAY_BETWEEN_RUNS_MS = 10;

async function runBenchmarkSync(title, fn) {
  logTitle(title);
  fn(); // discard first run to avoid cold start issues

  let durationTotal = 0;

  for (let run = 0; run < BENCHMARK_REPEAT; run++) {
    await setTimeout(DELAY_BETWEEN_RUNS_MS);
    durationTotal += measureSync(fn);
  }

  logResult(durationTotal / BENCHMARK_REPEAT);
}

async function runBenchmarkAsync(title, fn) {
  logTitle(title);

  await fn(); // discard first run to avoid cold start issues

  let durationTotal = 0;

  for (let run = 0; run < BENCHMARK_REPEAT; run++) {
    await setTimeout(DELAY_BETWEEN_RUNS_MS);
    durationTotal += await measureAsync(fn);
  }

  logResult(durationTotal / BENCHMARK_REPEAT);
}

module.exports = {
  runBenchmarkSync,
  runBenchmarkAsync,
};
