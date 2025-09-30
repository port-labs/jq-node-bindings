const { generateMediumData } = require("../utils/data.js");
const { benchmarkAsync } = require("../functions/exec-async.js");

(async () => {
  const { queries, data } = generateMediumData();
  for (const [key, query] of Object.entries(queries)) {
    await benchmarkAsync(`${key} query on medium dataset with async execution:`, data, query);
  }
})();
