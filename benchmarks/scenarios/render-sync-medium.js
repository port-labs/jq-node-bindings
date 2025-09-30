const { generateMediumTemplateData } = require("../utils/data.js");
const { benchmarkRenderSync } = require("../functions/render-sync.js");

(async () => {
  const { templates, data } = generateMediumTemplateData();
  for (const [key, template] of Object.entries(templates)) {
    await benchmarkRenderSync(
      `${key} template on medium dataset with sync rendering:`,
      data,
      template
    );
  }
})();
