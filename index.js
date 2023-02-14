const jq = require('bindings')('jq-node-bindings');

console.log(jq)

const w =  jq.exec(JSON.stringify({ foo: 'bar' }), '.foo');

console.log(w)
