const pkg = require("../../lib/index.js");
const { execAsync } = pkg;
const { runBenchmarkAsync } = require("../utils/run.js");

function benchmarkAsync(title, data, query) {
  return runBenchmarkAsync(title, () => execAsync(data, query));
}

module.exports = {
  benchmarkAsync,
};
