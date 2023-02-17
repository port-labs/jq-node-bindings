const nativeJq = require('bindings')('jq-node-bindings')

const escapeFilter = (filter) => {
  // Escape single quotes only if they are opening or closing a string
  return filter.replace(/^'|'$|(?<=\W)'(?=[^"]*$)|"(?=[^"]*'$)/g, '"');
}


module.exports = {
  exec: (object, filter) => {
    try {
      console.log(escapeFilter(filter))
      const data =  nativeJq.exec(JSON.stringify(object), escapeFilter(filter))

      return data?.value;
    } catch (err) {
      return null
    }
  }
};

