const pkg = require("../../lib/index.js");
const { renderRecursively } = pkg;
const { runBenchmarkSync } = require("../utils/run.js");

function benchmarkRenderSync(title, data, template) {
  return runBenchmarkSync(title, () => renderRecursively(data, template));
}

module.exports = {
  benchmarkRenderSync,
};
