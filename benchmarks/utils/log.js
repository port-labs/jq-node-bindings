function logTitle(title) {
    console.log(title);
}

function logResult(time) {
  console.log(`${time.toFixed(3)}ms`);
}

module.exports = {
  logTitle,
  logResult,
};
