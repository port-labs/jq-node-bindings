const nativeJq = require('bindings')('jq-node-bindings')
let pLimit = null
let currentLimit = 2

const initPLimit = async () => {
  if (!pLimit) {
    const module = await import('p-limit')
    pLimit = module.default(currentLimit)
  }
  return pLimit
}

const setLimit = (limit) => {
  if (typeof limit !== 'number' || limit < 1) {
    throw new Error('Limit must be a positive number')
  }
  currentLimit = limit
  pLimit = null
}

nativeJq.setCacheSize(2000)

const formatFilter = (filter, {enableEnv = false} = {}) => {
  // Escape single quotes only if they are opening or closing a string
  let formattedFilter = filter.replace(/(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g, '$1"$2');
  // Conditionally enable access to env
  return enableEnv ? formattedFilter : `def env: {}; {} as $ENV | ${formattedFilter}`;
}


class JqExecError extends Error {
}

class JqExecCompileError extends JqExecError {
}

const exec = (object, filter, {enableEnv = false, throwOnError = false} = {}) => {
  try {
    const data = nativeJq.execSync(JSON.stringify(object), formatFilter(filter, {enableEnv}))

    return data?.value;
  } catch (err) {
    if (throwOnError) {
      throw new (err?.message?.startsWith('jq: compile error') ? JqExecCompileError : JqExecError)(err.message);
    }
    return null
  }
}

const execAsync = async (object, filter, {enableEnv = false, throwOnError = false} = {}) => {
  const limit = await initPLimit()
  try {
    const data = await limit(() => nativeJq.execAsync(JSON.stringify(object), formatFilter(filter, {enableEnv})))
    return data?.value;
  } catch (err) {
    if (throwOnError) {
      throw new (err?.message?.startsWith('jq: compile error') ? JqExecCompileError : JqExecError)(err.message);
    }
    return null
  }
}
module.exports = {
  exec,
  execAsync,
  setLimit,
  setCacheSize:nativeJq.setCacheSize,
  JqExecError,
  JqExecCompileError
};
