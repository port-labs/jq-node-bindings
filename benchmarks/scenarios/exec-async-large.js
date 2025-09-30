const { generateLargeData } = require("../utils/data.js");
const { benchmarkAsync } = require("../functions/exec-async.js");

(async () => {
  const { queries, data } = generateLargeData();
  for (const [key, query] of Object.entries(queries)) {
    await benchmarkAsync(`${key} query on large dataset with async execution:`, data, query);
  }
})();
