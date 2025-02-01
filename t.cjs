const jq = require('./lib/index');
const { performance } = require('perf_hooks');

const test = async (n, m) => {
  const query =  `{i:.i,x:[range(${m})][0]}|.i`
  const now = performance.now()
  for (let i = 0; i < n; i++) {
    try {
      await jq.execAsync({i}, query, {timeoutSec: 1, throwOnError: true})
    } catch(e) {
      //console.error('ERROR', e)
    }
  }
  return performance.now() - now
}

const avgTest = async (points, n, m) => {
  let sum = 0
  for(let i = 0; i < points; i++) {
    sum += await test(n, m)
  }
  return sum / points
}

(async () => {
  const timeoutTest = await avgTest(5, 1, 10000000000)
  console.log('timeoutTest', timeoutTest, timeoutTest < 2000)
  for(let i = 0; i < 5; i++) {
    const m = 10 ** i
    console.log(m, await avgTest(5, 1000, m))
  }
})()
