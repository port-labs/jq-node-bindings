const nativeJq = require('bindings')('jq-node-bindings');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

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

// Worker thread code - persistent worker that handles multiple requests
if (!isMainThread && workerData?.isJqPoolWorker) {
    parentPort.on('message', ({ id, object, filter, enableEnv }) => {
        try {
            const data = nativeJq.execSync(JSON.stringify(object), formatFilter(filter, { enableEnv }));
            parentPort.postMessage({ id, success: true, value: data?.value });
        } catch (err) {
            parentPort.postMessage({ id, success: false, error: err.message });
        }
    });
}

// Worker pool for async execution
const DEFAULT_TIMEOUT_SEC = 30;
const POOL_SIZE = Math.max(1, os.cpus().length - 1);
let workerPool = null;
let poolIndex = 0;
let requestId = 0;
const pendingRequests = new Map();

function getWorkerPool() {
    if (workerPool) return workerPool;

    workerPool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        const worker = new Worker(__filename, {
            workerData: { isJqPoolWorker: true }
        });
        worker.on('message', ({ id, success, value, error }) => {
            const pending = pendingRequests.get(id);
            if (pending) {
                clearTimeout(pending.timeoutId);
                pendingRequests.delete(id);
                if (success) {
                    pending.resolve(value);
                } else if (pending.throwOnError) {
                    const ErrorClass = error?.startsWith('jq: compile error') ? JqExecCompileError : JqExecError;
                    pending.reject(new ErrorClass(error));
                } else {
                    pending.resolve(null);
                }
            }
        });
        worker.on('error', (err) => {
            // Worker crashed - remove pending requests for this worker
            for (const [id, pending] of pendingRequests) {
                if (pending.workerId === i) {
                    clearTimeout(pending.timeoutId);
                    pendingRequests.delete(id);
                    if (pending.throwOnError) {
                        pending.reject(new JqExecError(err.message));
                    } else {
                        pending.resolve(null);
                    }
                }
            }
        });
        worker.unref(); // Don't keep process alive just for pool
        workerPool.push(worker);
    }
    return workerPool;
}

// Async execution with worker pool (truly async, non-blocking)
const execAsync = async (object, filter, { enableEnv = false, throwOnError = false, timeoutSec = DEFAULT_TIMEOUT_SEC } = {}) => {
    if (filter === null || filter === undefined || typeof filter !== 'string') {
        if (throwOnError) {
            throw new JqExecError('Invalid filter input');
        }
        return null;
    }

    const pool = getWorkerPool();
    const id = ++requestId;
    const workerId = poolIndex;
    poolIndex = (poolIndex + 1) % pool.length;
    const worker = pool[workerId];

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingRequests.delete(id);
            if (throwOnError) {
                reject(new JqTimeoutError('timeout'));
            } else {
                resolve(null);
            }
        }, timeoutSec * 1000);

        pendingRequests.set(id, { resolve, reject, throwOnError, timeoutId, workerId });
        worker.postMessage({ id, object, filter, enableEnv });
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
