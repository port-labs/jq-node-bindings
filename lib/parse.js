const CH_BACKSLASH = 92; // '\'
const CH_DOUBLE_QUOTE = 34; // '"'
const CH_SINGLE_QUOTE = 39; // "'"
const CH_OPEN_BRACE = 123; // '{'
const CH_CLOSE_BRACE = 125; // '}'

const findInsideDoubleBracesIndices = (input) => {
  let wrappingQuote = 0;
  let insideDoubleBracesStart = -1;
  const indices = [];
  const len = input.length;

  for (let i = 0; i < len; i++) {
    const cc = input.charCodeAt(i);

    if (insideDoubleBracesStart !== -1 && cc === CH_BACKSLASH) {
      i++;
      continue;
    }
    if (
      insideDoubleBracesStart !== -1 &&
      (cc === CH_DOUBLE_QUOTE || cc === CH_SINGLE_QUOTE)
    ) {
      if (!wrappingQuote) {
        wrappingQuote = cc;
      } else if (wrappingQuote === cc) {
        wrappingQuote = 0;
      }
    } else if (
      !wrappingQuote &&
      cc === CH_OPEN_BRACE &&
      i > 0 &&
      input.charCodeAt(i - 1) === CH_OPEN_BRACE
    ) {
      if (insideDoubleBracesStart !== -1) {
        throw new Error(
          `Found double braces in index ${i - 1} inside other one in index ${
            insideDoubleBracesStart - 2
          }`
        );
      }
      insideDoubleBracesStart = i + 1;
      if (i + 1 < len && input.charCodeAt(i + 1) === CH_OPEN_BRACE) {
        i++;
      }
    } else if (
      !wrappingQuote &&
      cc === CH_CLOSE_BRACE &&
      i > 0 &&
      input.charCodeAt(i - 1) === CH_CLOSE_BRACE
    ) {
      if (insideDoubleBracesStart !== -1) {
        indices.push({ start: insideDoubleBracesStart, end: i - 1 });
        insideDoubleBracesStart = -1;
        if (i + 1 < len && input.charCodeAt(i + 1) === CH_CLOSE_BRACE) {
          i++;
        }
      } else {
        throw new Error(
          `Found closing double braces in index ${
            i - 1
          } without opening double braces`
        );
      }
    }
  }

  if (insideDoubleBracesStart !== -1) {
    throw new Error(
      `Found opening double braces in index ${
        insideDoubleBracesStart - 2
      } without closing double braces`
    );
  }

  return indices;
};

module.exports = findInsideDoubleBracesIndices;
