const { generateSmallTemplateData } = require("../utils/data.js");
const { benchmarkRenderAsync } = require("../functions/render-async.js");

(async () => {
  const { templates, data } = generateSmallTemplateData();
  for (const [key, template] of Object.entries(templates)) {
    await benchmarkRenderAsync(
      `${key} template on small dataset with async rendering:`,
      data,
      template
    );
  }
})();
