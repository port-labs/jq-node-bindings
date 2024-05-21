const jq = require('./jq');

const findInsideDoubleBracesIndices = (input) => {
  let wrappingQuote = null;
  let insideDoubleBracesStart = null;
  const indices = [];

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (insideDoubleBracesStart && char === '\\') {
      // If next character is escaped, skip it
      i += 1;
    }
    if (insideDoubleBracesStart && (char === '"' || char === "'")) {
      // If inside double braces and inside quotes, ignore braces
      if (!wrappingQuote) {
        wrappingQuote = char;
      } else if (wrappingQuote === char) {
        wrappingQuote = null;
      }
    } else if (!wrappingQuote && char === '{' && i > 0 && input[i - 1] === '{') {
      // if opening double braces that not wrapped with quotes
      if (insideDoubleBracesStart) {
        throw new Error(`Found double braces in index ${i - 1} inside other one in index ${insideDoubleBracesStart - '{{'.length}`);
      }
      insideDoubleBracesStart = i + 1;
      if (input[i + 1] === '{') {
        // To overcome three "{" in a row considered as two different opening double braces
        i += 1;
      }
    } else if (!wrappingQuote && char === '}' && i > 0 && input[i - 1] === '}') {
      // if closing double braces that not wrapped with quotes
      if (insideDoubleBracesStart) {
        indices.push({start: insideDoubleBracesStart, end: i - 1});
        insideDoubleBracesStart = null;
        if (input[i + 1] === '}') {
          // To overcome three "}" in a row considered as two different closing double braces
          i += 1;
        }
      } else {
        throw new Error(`Found closing double braces in index ${i - 1} without opening double braces`);
      }
    }
  }

  if (insideDoubleBracesStart) {
    throw new Error(`Found opening double braces in index ${insideDoubleBracesStart - '{{'.length} without closing double braces`);
  }

  return indices;
}

const render = (inputJson, template, execOptions = {}) => {
  if (typeof template !== 'string') {
    return null;
  }
  const indices = findInsideDoubleBracesIndices(template);
  if (!indices.length) {
    // If no jq templates in string, return it
    return template;
  }

  const firstIndex = indices[0];
  if (indices.length === 1 && template.trim().startsWith('{{') && template.trim().endsWith('}}')) {
    // If entire string is a template, evaluate and return the result with the original type
    return jq.exec(inputJson, template.slice(firstIndex.start, firstIndex.end), execOptions);
  }

  let result = template.slice(0, firstIndex.start - '{{'.length); // Initiate result with string until first template start index
  indices.forEach((index, i) => {
    const jqResult = jq.exec(inputJson, template.slice(index.start, index.end), execOptions);
    result +=
      // Add to the result the stringified evaluated jq of the current template
      (typeof jqResult === 'string' ? jqResult : JSON.stringify(jqResult)) +
      // Add to the result from template end index. if last template index - until the end of string, else until next start index
      template.slice(
        index.end + '}}'.length,
        i + 1 === indices.length ? template.length : indices[i + 1].start - '{{'.length,
      );
  });

  return result;
}

const renderRecursively = (inputJson, template, execOptions = {}) => {
  if (typeof template === 'string') {
    return render(inputJson, template, execOptions);
  }
  if (Array.isArray(template)) {
    return template.map((value) => renderRecursively(inputJson, value, execOptions));
  }
  if (typeof template === 'object' && template !== null) {
    return Object.fromEntries(
      Object.entries(template).flatMap(([key, value]) => {
        const SPREAD_KEYWORD = "spreadValue";
        const keywordMatcher = `^\\s*\\{\\{\\s*${SPREAD_KEYWORD}\\(\\s*\\)\\s*\\}\\}\\s*$`;  // matches {{ <Keyword>() }} with white spaces where you'd expect them

        if (key.match(keywordMatcher)) {
          const evaluatedValue = renderRecursively(inputJson, value, execOptions);
          if (typeof evaluatedValue !== "object") {
            throw new Error(
              `Evaluated value should be an object if the key is ${key}. Original value: ${value}, evaluated to: ${JSON.stringify(evaluatedValue)}`
            );
          }
          return Object.entries(evaluatedValue);
        }

        const evaluatedKey = renderRecursively(inputJson, key, execOptions);
        if (!['undefined', 'string'].includes(typeof evaluatedKey) && evaluatedKey !== null) {
          throw new Error(
            `Evaluated object key should be undefined, null or string. Original key: ${key}, evaluated to: ${JSON.stringify(evaluatedKey)}`,
          );
        }
        return evaluatedKey ? [[evaluatedKey, renderRecursively(inputJson, value, execOptions)]] : [];
      }),
    );
  }

  return template;
}

module.exports = {
  renderRecursively
};
