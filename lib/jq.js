const nativeJq = require('bindings')('jq-node-bindings');

const formatFilter = (filter, { enableEnv = false } = {}) => {
    // Escape single quotes only if they are opening or closing a string
    let formattedFilter = filter.replace(/(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g, '$1"$2');
    // Conditionally enable access to env
    return enableEnv ? formattedFilter : `def env: {}; {} as $ENV | ${formattedFilter}`;
};

class JqExecError extends Error {
    constructor(message) {
        super(message);
        this.name = 'JqExecError';
    }
}

class JqExecCompileError extends JqExecError {
    constructor(message) {
        super(message);
        this.name = 'JqExecCompileError';
    }
}

class JqTimeoutError extends JqExecError {
    constructor(message = 'timeout') {
        super(message);
        this.name = 'JqTimeoutError';
    }
}

/**
 * Synchronous jq execution (runs on main thread)
 */
const exec = (object, filter, { enableEnv = false, throwOnError = false } = {}) => {
    try {
        const data = nativeJq.execSync(JSON.stringify(object), formatFilter(filter, { enableEnv }));
        return data?.value;
    } catch (err) {
        if (throwOnError) {
            const ErrorClass = err?.message?.startsWith('jq: compile error') ? JqExecCompileError : JqExecError;
            throw new ErrorClass(err.message);
        }
        return null;
    }
};

/**
 * Asynchronous jq execution using N-API async work
 * - Non-blocking: work runs on libuv thread pool
 * - Thread-safe: each libuv thread has its own thread_local cache
 * - Efficient: no worker_thread spawn overhead, direct native execution
 */
const execAsync = async (object, filter, { enableEnv = false, throwOnError = false, timeoutSec = 30 } = {}) => {
    if (filter === null || filter === undefined || typeof filter !== 'string') {
        if (throwOnError) {
            throw new JqExecError('Invalid filter input');
        }
        return null;
    }

    const json = JSON.stringify(object);
    const formattedFilter = formatFilter(filter, { enableEnv });

    // Create timeout promise
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new JqTimeoutError('timeout'));
        }, timeoutSec * 1000);
    });

    // Execute using native async work
    const resultPromise = nativeJq.execAsync(json, formattedFilter)
        .then(data => data?.value);

    try {
        const result = await Promise.race([resultPromise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (err) {
        clearTimeout(timeoutId);
        if (throwOnError) {
            if (err instanceof JqTimeoutError) {
                throw err;
            }
            const message = err?.message || String(err);
            const ErrorClass = message.startsWith('jq: compile error') ? JqExecCompileError : JqExecError;
            throw new ErrorClass(message);
        }
        return null;
    }
};

// No-op for backwards compatibility
const setCacheSize = (size) => size;

module.exports = {
    exec,
    execAsync,
    setCacheSize,
    JqExecError,
    JqExecCompileError,
    JqTimeoutError,
};
