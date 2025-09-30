const { generateLargeTemplateData } = require("../utils/data.js");
const { benchmarkRenderSync } = require("../functions/render-sync.js");

(async () => {
  const { templates, data } = generateLargeTemplateData();
  for (const [key, template] of Object.entries(templates)) {
    await benchmarkRenderSync(
      `${key} template on large dataset with sync rendering:`,
      data,
      template
    );
  }
})();
