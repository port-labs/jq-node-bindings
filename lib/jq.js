const nativeJq = require('bindings')('jq-node-bindings');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const formatFilter = (filter, { enableEnv = false } = {}) => {
    // Escape single quotes only if they are opening or closing a string
    let formattedFilter = filter.replace(/(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g, '$1"$2');
    // Conditionally enable access to env
    return enableEnv ? formattedFilter : `def env: {}; {} as $ENV | ${formattedFilter}`;
};

class JqExecError extends Error {}

class JqExecCompileError extends JqExecError {}

class JqTimeoutError extends JqExecError {
    constructor(message = 'timeout') {
        super(message);
        this.name = 'JqTimeoutError';
    }
}

const exec = (object, filter, { enableEnv = false, throwOnError = false, timeoutSec } = {}) => {
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

// Worker thread execution code
if (!isMainThread && workerData?.isJqWorker) {
    const { object, filter, enableEnv } = workerData;
    try {
        const data = nativeJq.execSync(JSON.stringify(object), formatFilter(filter, { enableEnv }));
        parentPort.postMessage({ success: true, value: data?.value });
    } catch (err) {
        parentPort.postMessage({ success: false, error: err.message });
    }
    process.exit(0);
}

// Async execution with timeout support using worker threads
const execAsync = async (object, filter, { enableEnv = false, throwOnError = false, timeoutSec } = {}) => {
    if (filter === null || filter === undefined || typeof filter !== 'string') {
        if (throwOnError) {
            throw new JqExecError('Invalid filter input');
        }
        return null;
    }

    // If no timeout, just run synchronously
    if (!timeoutSec) {
        return exec(object, filter, { enableEnv, throwOnError });
    }

    // Use worker thread for timeout support
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: { isJqWorker: true, object, filter, enableEnv }
        });

        const timeoutId = setTimeout(() => {
            worker.terminate();
            if (throwOnError) {
                reject(new JqTimeoutError('timeout'));
            } else {
                resolve(null);
            }
        }, timeoutSec * 1000);

        worker.on('message', (result) => {
            clearTimeout(timeoutId);
            if (result.success) {
                resolve(result.value);
            } else if (throwOnError) {
                const ErrorClass = result.error?.startsWith('jq: compile error') ? JqExecCompileError : JqExecError;
                reject(new ErrorClass(result.error));
            } else {
                resolve(null);
            }
        });

        worker.on('error', (err) => {
            clearTimeout(timeoutId);
            if (throwOnError) {
                reject(new JqExecError(err.message));
            } else {
                resolve(null);
            }
        });
    });
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
