function measureSync(fn) {
  const start = process.hrtime.bigint();
  fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // ms
}

async function measureAsync(fn) {
  const start = process.hrtime.bigint();
  await fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // ms
}

module.exports = {
  measureSync,
  measureAsync,
};
