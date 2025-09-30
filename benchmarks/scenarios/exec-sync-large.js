const { generateLargeData } = require("../utils/data.js");
const { benchmarkSync } = require("../functions/exec.js");

(async () => {
  const { queries, data } = generateLargeData();
  for (const [key, query] of Object.entries(queries)) {
    await benchmarkSync(`${key} query on large dataset with async execution:`, data, query);
  }
})();
