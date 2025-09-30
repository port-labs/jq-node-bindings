const { generateSmallData } = require("../utils/data.js");
const { benchmarkSync } = require("../functions/exec.js");

(async () => {
  const { queries, data } = generateSmallData();
  for (const [key, query] of Object.entries(queries)) {
    await benchmarkSync(`${key} query on small dataset with async execution:`, data, query);
  }
})();
