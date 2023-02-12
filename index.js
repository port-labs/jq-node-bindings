const jq = require('bindings')('jq-node-bindings');

console.log(jq.execute(JSON.stringify({ foo: 'bar' }, '.foo')));
