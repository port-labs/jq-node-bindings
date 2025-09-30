const { generateSmallData } = require("../utils/data.js");
const { benchmarkAsync } = require("../functions/exec-async.js");

(async () => {
  const { queries, data } = generateSmallData();
  for (const [key, query] of Object.entries(queries)) {
    await benchmarkAsync(`${key} query on small dataset with async execution:`, data, query);
  }
})();
