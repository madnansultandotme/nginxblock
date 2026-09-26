const blockNames = new Set(['map', 'server', 'upstream', 'location']);

function error(line, message) {
  return {line, message};
}

export function validateConfig(config) {
  if (typeof config !== 'string') return {valid: false, errors: [error(0, 'Configuration must be a string')]};

  const errors = [];
  let braces = 0;
  let quote = '';
  let escaped = false;
  let line = 1;
  let hasServer = false;
  let hasLocation = false;
  const lines = config.split('\n');

  for (const source of lines) {
    let cleaned = '';
    let comment = false;
    for (const character of source) {
      if (comment) continue;
      if (escaped) {
        escaped = false;
        cleaned += character;
        continue;
      }
      if (quote && character === '\\') {
        escaped = true;
        cleaned += character;
        continue;
      }
      if (quote) {
        if (character === quote) quote = '';
        cleaned += character;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        cleaned += character;
      } else if (character === '#') {
        comment = true;
      } else {
        cleaned += character;
      }
    }

    const text = cleaned.trim();
    if (!text) {
      line++;
      continue;
    }

    for (const character of cleaned) {
      if (character === '{') braces++;
      if (character === '}') {
        braces--;
        if (braces < 0) errors.push(error(line, 'Closing brace has no matching opening brace'));
      }
    }

    if (text.endsWith('{')) {
      const name = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1];
      if (!name || !blockNames.has(name)) errors.push(error(line, 'Unsupported or missing block name'));
      if (name === 'server') hasServer = true;
      if (name === 'location') hasLocation = true;
    } else if (!text.endsWith('}') && !text.endsWith(';')) {
      errors.push(error(line, 'Directive must end with ;, {, or }'));
    }
    line++;
  }

  if (quote) errors.push(error(lines.length, 'Unclosed quote'));
  if (braces) errors.push(error(lines.length, 'Unbalanced braces'));
  if (!hasServer) errors.push(error(0, 'Configuration must contain a server block'));
  if (!hasLocation) errors.push(error(0, 'Configuration must contain a location block'));

  return {valid: errors.length === 0, errors};
}