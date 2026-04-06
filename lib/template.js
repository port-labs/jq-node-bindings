const jq = require("./jq");
const findInsideDoubleBracesIndices = require("./parse");

const CH_OPEN_BRACE = 123; // '{'
const CH_CLOSE_BRACE = 125; // '}'
const BRACE_PAIR_LEN = 2; // length of '{{' or '}}'

const SPREAD_KEYWORD_PATTERN = /^\s*\{\{\s*spreadValue\(\s*\)\s*\}\}\s*$/;

const render = (jsonStr, template, execOptions) => {
  if (typeof template !== "string") {
    return null;
  }
  const indices = findInsideDoubleBracesIndices(template);
  if (!indices.length) {
    return template;
  }

  const firstIndex = indices[0];
  if (indices.length === 1) {
    const trimmed = template.trim();
    if (
      trimmed.charCodeAt(0) === CH_OPEN_BRACE &&
      trimmed.charCodeAt(1) === CH_OPEN_BRACE &&
      trimmed.charCodeAt(trimmed.length - 1) === CH_CLOSE_BRACE &&
      trimmed.charCodeAt(trimmed.length - BRACE_PAIR_LEN) === CH_CLOSE_BRACE
    ) {
      return jq.execRaw(
        jsonStr,
        template.slice(firstIndex.start, firstIndex.end),
        execOptions
      );
    }
  }

  let result = template.slice(0, firstIndex.start - BRACE_PAIR_LEN);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    const jqResult = jq.execRaw(
      jsonStr,
      template.slice(index.start, index.end),
      execOptions
    );
    result +=
      typeof jqResult === "string" ? jqResult : JSON.stringify(jqResult);
    result += template.slice(
      index.end + BRACE_PAIR_LEN,
      i + 1 === indices.length
        ? template.length
        : indices[i + 1].start - BRACE_PAIR_LEN
    );
  }

  return result;
};

const renderRecursively = (inputJson, template, execOptions) => {
  if (!execOptions) execOptions = {};
  const jsonStr = JSON.stringify(inputJson);
  return _renderRecursively(jsonStr, template, execOptions);
};

const _renderRecursively = (jsonStr, template, execOptions) => {
  if (typeof template === "string") {
    return render(jsonStr, template, execOptions);
  }
  if (Array.isArray(template)) {
    const len = template.length;
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
      result[i] = _renderRecursively(jsonStr, template[i], execOptions);
    }
    return result;
  }
  if (typeof template === "object" && template !== null) {
    const keys = Object.keys(template);
    const result = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = template[key];

      if (SPREAD_KEYWORD_PATTERN.test(key)) {
        const evaluatedValue = _renderRecursively(jsonStr, value, execOptions);
        if (typeof evaluatedValue !== "object") {
          throw new Error(
            `Evaluated value should be an object if the key is ${key}. Original value: ${value}, evaluated to: ${JSON.stringify(
              evaluatedValue
            )}`
          );
        }
        const spreadKeys = Object.keys(evaluatedValue);
        for (let j = 0; j < spreadKeys.length; j++) {
          result[spreadKeys[j]] = evaluatedValue[spreadKeys[j]];
        }
        continue;
      }

      const evaluatedKey = _renderRecursively(jsonStr, key, execOptions);
      const keyType = typeof evaluatedKey;
      if (
        keyType !== "undefined" &&
        keyType !== "string" &&
        evaluatedKey !== null
      ) {
        throw new Error(
          `Evaluated object key should be undefined, null or string. Original key: ${key}, evaluated to: ${JSON.stringify(
            evaluatedKey
          )}`
        );
      }
      if (evaluatedKey) {
        result[evaluatedKey] = _renderRecursively(jsonStr, value, execOptions);
      }
    }
    return result;
  }

  return template;
};

module.exports = {
  renderRecursively,
};
