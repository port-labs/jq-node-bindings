const nativeJq = require('bindings')('jq-node-bindings')

module.exports = {
  exec: (object, filter) => {
    try {
      const data =  nativeJq.exec(JSON.stringify(object), filter)

      return data?.value;
    } catch (err) {
      return null
    }
  }
};

