const pkg = require("../../lib/index.js");
const { renderRecursivelyAsync } = pkg;
const { runBenchmarkAsync } = require("../utils/run.js");

function benchmarkRenderAsync(title, data, template) {
  return runBenchmarkAsync(title, () => renderRecursivelyAsync(data, template));
}

module.exports = {
  benchmarkRenderAsync,
};
