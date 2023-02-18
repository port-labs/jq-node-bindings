const nativeJq = require('bindings')('jq-node-bindings')

const escapeFilter = (filter) => {
  // Escape single quotes only if they are opening or closing a string
  return filter.replace(/(^|\s)'(?!\s|")|(?<!\s|")'(\s|$)/g, '$1"$2');
}


module.exports = {
  exec: (object, filter) => {
    try {
      const data =  nativeJq.exec(JSON.stringify(object), escapeFilter(filter))

      return data?.value;
    } catch (err) {
      return null
    }
  }
};

