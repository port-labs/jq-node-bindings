const jq = require('./lib/index');
const {performance} = require('perf_hooks');
(async () => {
  const now = performance.now()
  try {
    for(let i = 0; i < 100000; i++) {
      const result = await jq.execAsync({i}, '{i:.i,x:[range(10)][0]}|.i', {timeoutSec: 1, throwOnError: true})
      if(result !== i) {
        throw new Error(`Expected ${i} but got ${result}`)
      }
    }
  } catch(e) {
    console.error('ERROR', e)
  } finally {
    console.log(performance.now() - now)
  }
})();
