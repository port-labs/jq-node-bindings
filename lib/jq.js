const nativeJq = require('bindings')('jq-node-bindings');

const formatFilter = (filter, { enableEnv = false } = {}) => {
    // Escape single quotes only if they are opening or closing a string
    let formattedFilter = filter.replace(/(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g, '$1"$2');
    // Conditionally enable access to env
    return enableEnv ? formattedFilter : `def env: {}; {} as $ENV | ${formattedFilter}`;
};

class JqExecError extends Error {}

class JqExecCompileError extends JqExecError {}

const exec = (object, filter, { enableEnv = false, throwOnError = false } = {}) => {
    try {
        const data = nativeJq.execSync(JSON.stringify(object), formatFilter(filter, { enableEnv }));
        return data?.value;
    } catch (err) {
        if (throwOnError) {
            throw new (err?.message?.startsWith('jq: compile error') ? JqExecCompileError : JqExecError)(err.message);
        }
        return null;
    }
};

// Async is just a Promise wrapper for API compatibility
// True parallelism should be handled at the application level (worker_threads, cluster, etc.)
const execAsync = async (object, filter, { enableEnv = false, throwOnError = false } = {}) => {
    if (filter === null || filter === undefined || typeof filter !== 'string') {
        if (throwOnError) {
            throw new JqExecError('Invalid filter input');
        }
        return null;
    }
    return exec(object, filter, { enableEnv, throwOnError });
};

// No-op for backwards compatibility
const setCacheSize = (size) => size;

module.exports = {
    exec,
    execAsync,
    setCacheSize,
    JqExecError,
    JqExecCompileError,
};
