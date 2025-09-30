const { generateMediumTemplateData } = require("../utils/data.js");
const { benchmarkRenderAsync } = require("../functions/render-async.js");

(async () => {
  const { templates, data } = generateMediumTemplateData();
  for (const [key, template] of Object.entries(templates)) {
    await benchmarkRenderAsync(
      `${key} template on medium dataset with async rendering:`,
      data,
      template
    );
  }
})();
