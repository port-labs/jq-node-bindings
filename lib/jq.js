const nativeJq = require('bindings')('jq-node-bindings')

const formatFilter = (filter, options) => {
  // Escape single quotes only if they are opening or closing a string
  let formattedFilter = filter.replace(/(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g, '$1"$2');
  // Conditionally enable access to env
  return options.enableEnv ? formattedFilter: `def env: {}; {} as $ENV | ${formattedFilter}`;
}
const exec = (object, filter, options = { enableEnv: false }) => {
  try {
    const data = nativeJq.exec(JSON.stringify(object), formatFilter(filter, options))

    return data?.value;
  } catch (err) {
    return null
  }
}

module.exports = {
  exec
};
