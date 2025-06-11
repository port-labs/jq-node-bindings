const jq = require('./jq');
const template = require('./template');
const templateAsync = require('./templateAsync');


module.exports = {
  exec: jq.exec,
  execAsync: jq.execAsync,
  setCacheSize: jq.setCacheSize,
  renderRecursively: template.renderRecursively,
  renderRecursivelyAsync: templateAsync.renderRecursivelyAsync,
  JqExecError: jq.JqExecError,
  JqExecCompileError: jq.JqExecCompileError,
};
