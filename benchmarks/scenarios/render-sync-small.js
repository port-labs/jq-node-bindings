const { generateSmallTemplateData } = require("../utils/data.js");
const { benchmarkRenderSync } = require("../functions/render-sync.js");

(async () => {
  const { templates, data } = generateSmallTemplateData();
  for (const [key, template] of Object.entries(templates)) {
    await benchmarkRenderSync(
      `${key} template on small dataset with sync rendering:`,
      data,
      template
    );
  }
})();
