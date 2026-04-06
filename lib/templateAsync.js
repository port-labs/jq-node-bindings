const jq = require("./jq");
const findInsideDoubleBracesIndices = require("./parse");

const CH_OPEN_BRACE = 123; // '{'
const CH_CLOSE_BRACE = 125; // '}'
const BRACE_PAIR_LEN = 2; // length of '{{' or '}}'

const SPREAD_KEYWORD_PATTERN = /^\s*\{\{\s*spreadValue\(\s*\)\s*\}\}\s*$/;

const renderAsync = async (jsonStr, template, execOptions) => {
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
      return jq.execRawAsync(
        jsonStr,
        template.slice(firstIndex.start, firstIndex.end),
        execOptions
      );
    }
  }

  let result = template.slice(0, firstIndex.start - BRACE_PAIR_LEN);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    const jqResult = await jq.execRawAsync(
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

const renderRecursivelyAsync = async (inputJson, template, execOptions) => {
  if (!execOptions) execOptions = {};
  const jsonStr = JSON.stringify(inputJson);
  return _renderRecursivelyAsync(jsonStr, template, execOptions);
};

const _renderRecursivelyAsync = async (jsonStr, template, execOptions) => {
  if (typeof template === "string") {
    return renderAsync(jsonStr, template, execOptions);
  }
  if (Array.isArray(template)) {
    const len = template.length;
    const promises = new Array(len);
    for (let i = 0; i < len; i++) {
      promises[i] = _renderRecursivelyAsync(jsonStr, template[i], execOptions);
    }
    return Promise.all(promises);
  }
  if (typeof template === "object" && template !== null) {
    const keys = Object.keys(template);
    const len = keys.length;
    const promises = new Array(len);
    for (let i = 0; i < len; i++) {
      const key = keys[i];
      promises[i] = _processKeyAsync(jsonStr, key, template[key], execOptions);
    }
    const entries = await Promise.all(promises);
    const result = {};
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry) {
        const pairs = entry.pairs;
        for (let j = 0; j < pairs.length; j++) {
          result[pairs[j][0]] = pairs[j][1];
        }
      }
    }
    return result;
  }

  return template;
};

const _processKeyAsync = async (jsonStr, key, value, execOptions) => {
  if (SPREAD_KEYWORD_PATTERN.test(key)) {
    const evaluatedValue = await _renderRecursivelyAsync(
      jsonStr,
      value,
      execOptions
    );
    if (typeof evaluatedValue !== "object") {
      throw new Error(
        `Evaluated value should be an object if the key is ${key}. Original value: ${value}, evaluated to: ${JSON.stringify(
          evaluatedValue
        )}`
      );
    }
    const spreadKeys = Object.keys(evaluatedValue);
    const pairs = new Array(spreadKeys.length);
    for (let i = 0; i < spreadKeys.length; i++) {
      pairs[i] = [spreadKeys[i], evaluatedValue[spreadKeys[i]]];
    }
    return { pairs };
  }

  const evaluatedKey = await _renderRecursivelyAsync(jsonStr, key, execOptions);
  if (typeof evaluatedKey !== "string" && evaluatedKey != null) {
    throw new Error(
      `Evaluated object key should be undefined, null or string. Original key: ${key}, evaluated to: ${JSON.stringify(
        evaluatedKey
      )}`
    );
  }
  if (evaluatedKey) {
    return {
      pairs: [
        [
          evaluatedKey,
          await _renderRecursivelyAsync(jsonStr, value, execOptions),
        ],
      ],
    };
  }
  return null;
};

module.exports = {
  renderRecursivelyAsync,
};
