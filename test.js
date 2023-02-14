const jq = require('bindings')('jq-node-bindings');

console.log('jq')

for (let i = 0; i < 100000000; i++) {
    console.log(jq.exec(JSON.stringify({ ['foo' + i]: 'asdf' }), '.foo' + i));
}
