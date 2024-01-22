const nativeJq = require('bindings')('jq-node-bindings')

const formatFilter = (filter, {enableEnv = false} = {}) => {
  // Escape single quotes only if they are opening or closing a string
  let formattedFilter = filter.replace(/(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g, '$1"$2');
  // Conditionally enable access to env
  return enableEnv ? formattedFilter : `def env: {}; {} as $ENV | ${formattedFilter}`;
}
const exec = (object, filter, {enableEnv = false, throwOnError = false} = {}) => {
  try {
    const data = nativeJq.exec(JSON.stringify(object), formatFilter(filter, {enableEnv}))

    return data?.value;
  } catch (err) {
    if (throwOnError) {
      throw err;
    }
    return null
  }
}

module.exports = {
  exec
};
