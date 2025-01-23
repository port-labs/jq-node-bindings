const jq = require('./jq');

// TODO: There is more performant way doing this

const ESCAPE_CHAR = '\\';
const TEMPLATE_ELEMENT_START = '{{';
const TEMPLATE_ELEMENT_START_LENGTH = TEMPLATE_ELEMENT_START.length;
const TEMPLATE_ELEMENT_END = '}}';
const TEMPLATE_ELEMENT_END_LENGTH = TEMPLATE_ELEMENT_END.length;
const SPREAD_VALUE_REGEXP = new RegExp(/^\s*\{\{\s*spreadValue\(\s*\)\s*\}\}\s*$/);

const renderRecursivelyAsync = async (json, template) => {
  if (typeof template === 'string') {
    return renderAsync(json, template);
  }

  if (Array.isArray(template)) {
    const result = new Array(template.length);
    for (const value of template) {
      result.push(await renderRecursivelyAsync(json, value));
    }
    return result;
  }

  if (typeof template === 'object' && template !== null) {
    const result = {};

    for (const [key, value] of Object.entries(template)) {
      if (SPREAD_VALUE_REGEXP.test(key)) {
        const evaluatedValue = await renderRecursivelyAsync(json, value);
        if (evaluatedValue === null || typeof evaluatedValue !== 'object') {
          throw new Error(
            `Evaluated value should be an object if the key is ${key}. Original value: ${value}, evaluated to: ${JSON.stringify(evaluatedValue)}`,
          );
        }
        for (const [evaluatedValueEntryKey, evaluatedValueEntryValue] of Object.entries(evaluatedValue)) {
          result[evaluatedValueEntryKey] = evaluatedValueEntryValue;
        }
      }

      const evaluatedKey = await renderRecursivelyAsync(json, key);
      if (evaluatedKey != null && typeof evaluatedKey !== 'string') {
        throw new Error(
          `Evaluated object key should be undefined, null or string. Original key: ${key}, evaluated to: ${JSON.stringify(evaluatedKey)}`,
        );
      }

      if (evaluatedKey) {
        result[evaluatedKey] ??= await renderRecursivelyAsync(json, value);
      }
    }

    return result;
  }

  return template;
}

const renderAsync = async (json, template) => {
  // TODO: Maybe using Buffer for template slicing is faster?

  const indices = findInsideDoubleBracesIndices(template);
  if (!indices.length) {
    // If no jq templates in string, return it
    return template;
  }

  const firstIndex = indices[0];
  if (
    indices.length === 1 &&
      template.trim().startsWith(TEMPLATE_ELEMENT_START) &&
      template.trim().endsWith(TEMPLATE_ELEMENT_END)
  ) {
    // If entire string is a template, evaluate and return the result with the original type
    return jq.execAsync(json, template.slice(firstIndex.start, firstIndex.end));
  }

  let result = template.slice(0, firstIndex.start - TEMPLATE_ELEMENT_START_LENGTH); // Initiate result with string until first template start index

  for (let i = 0; i < indices.length; i += 1) {
    const jqResult = await jq.execAsync(json, template.slice(indices[i].start, indices[i].end));
    result +=
    (typeof jqResult === 'string' ? jqResult : JSON.stringify(jqResult)) + // Add to the result the stringified evaluated jq of the current template
      template.slice(
        indices[i].end + TEMPLATE_ELEMENT_END_LENGTH,
        i + 1 === indices.length ? template.length : indices[i + 1].start - TEMPLATE_ELEMENT_START_LENGTH,
      ); // Add to the result from template end index. if last template index - until the end of string, else until next start index
  }

  return result;
}

findInsideDoubleBracesIndices = (input) => {
	let wrappingQuote = null;
	let insideDoubleBracesStart = null;
	const indices = [];

	for (let i = 0; i < input.length; i += 1) {
		const char = input[i];

		if (insideDoubleBracesStart !== null && char === ESCAPE_CHAR) {
			// If next character is escaped, skip it
			i += 1;
		}
		if (insideDoubleBracesStart !== null && (char === '"' || char === "'")) {
			// If inside double braces and inside quotes, ignore braces
			if (wrappingQuote === null) {
				wrappingQuote = char;
			} else if (wrappingQuote === char) {
				wrappingQuote = null;
			}
		} else if (wrappingQuote === null && char === '{' && i > 0 && input[i - 1] === '{') {
			// if opening double braces that not wrapped with quotes
			if (insideDoubleBracesStart !== null) {
				throw new Error(
					`Found double braces in index ${i - 1} inside other one in index ${insideDoubleBracesStart - TEMPLATE_ELEMENT_START_LENGTH}`,
				);
			}
			insideDoubleBracesStart = i + 1;
			if (input[i + 1] === '{') {
				// To overcome three "{" in a row considered as two different opening double braces
				i += 1;
			}
		} else if (wrappingQuote === null && char === '}' && i > 0 && input[i - 1] === '}') {
			// if closing double braces that not wrapped with quotes
			if (insideDoubleBracesStart !== null) {
				indices.push({ start: insideDoubleBracesStart, end: i - 1 });
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

	if (insideDoubleBracesStart !== null) {
		throw new Error(
			`Found opening double braces in index ${insideDoubleBracesStart - '{{'.length} without closing double braces`,
		);
	}

	return indices;
}

module.exports = {
  renderRecursivelyAsync
}
