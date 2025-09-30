const { exec } = require("../../lib/index.js");
const { runBenchmarkSync } = require("../utils/run.js");

function benchmarkSync(title, data, query) {
  return runBenchmarkSync(title, () => exec(data, query));
}

module.exports = {
  benchmarkSync,
};
