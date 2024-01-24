const jq = require('./jq');
const template = require('./template');


module.exports = {
  exec: jq.exec,
  renderRecursively: template.renderRecursively,
  JqExecError: jq.JqExecError,
  JqExecCompileError: jq.JqExecCompileError,
};
