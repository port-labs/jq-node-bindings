const { benchmarkSync } = require("../functions/exec.js");
const { generateMediumData } = require("../utils/data.js");

(async () => {
  const { queries, data } = generateMediumData();
  for (const [key, query] of Object.entries(queries)) {
    await benchmarkSync(`${key} query on medium dataset with async execution:`, data, query);
  }
})();
