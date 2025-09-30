const { generateLargeTemplateData } = require("../utils/data.js");
const { benchmarkRenderAsync } = require("../functions/render-async.js");

(async () => {
  const { templates, data } = generateLargeTemplateData();
  for (const [key, template] of Object.entries(templates)) {
    await benchmarkRenderAsync(
      `${key} template on large dataset with async rendering:`,
      data,
      template
    );
  }
})();
