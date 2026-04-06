const nativeJq = require("bindings")("jq-node-bindings");
nativeJq.setCacheSize(1000);

const SINGLE_QUOTE_RE = /(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g;
const COMPILE_ERROR_PREFIX = "jq: compile error";
const ENV_DISABLE_PREFIX = "def env: {}; {} as $ENV | ";

const formatFilter = (filter, enableEnv) => {
  const formattedFilter = filter.replace(SINGLE_QUOTE_RE, '$1"$2');
  return enableEnv ? formattedFilter : ENV_DISABLE_PREFIX + formattedFilter;
};

class JqExecError extends Error {}

class JqExecCompileError extends JqExecError {}

const execRaw = (jsonStr, filter, execOptions) => {
  try {
    const data = nativeJq.execSync(
      jsonStr,
      formatFilter(filter, execOptions.enableEnv)
    );
    return data?.value;
  } catch (err) {
    if (execOptions.throwOnError) {
      const msg = err?.message;
      throw new (
        msg && msg.startsWith(COMPILE_ERROR_PREFIX)
          ? JqExecCompileError
          : JqExecError
      )(msg);
    }
    return null;
  }
};

const execRawAsync = async (jsonStr, filter, execOptions) => {
  try {
    const data = await nativeJq.execAsync(
      jsonStr,
      formatFilter(filter, execOptions.enableEnv),
      execOptions.timeoutSec
    );
    return data?.value;
  } catch (err) {
    if (execOptions.throwOnError) {
      const msg = err?.message;
      throw new (
        msg && msg.startsWith(COMPILE_ERROR_PREFIX)
          ? JqExecCompileError
          : JqExecError
      )(msg);
    }
    return null;
  }
};

const DEFAULT_OPTIONS = { enableEnv: false, throwOnError: false };

const exec = (object, filter, execOptions) => {
  return execRaw(
    JSON.stringify(object),
    filter,
    execOptions || DEFAULT_OPTIONS
  );
};

const execAsync = async (object, filter, execOptions) => {
  return execRawAsync(
    JSON.stringify(object),
    filter,
    execOptions || DEFAULT_OPTIONS
  );
};

module.exports = {
  exec,
  execAsync,
  execRaw,
  execRawAsync,
  setCacheSize: nativeJq.setCacheSize,
  JqExecError,
  JqExecCompileError,
};
