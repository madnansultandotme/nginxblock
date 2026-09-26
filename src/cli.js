#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {generate, explain, validateConfig} from './index.js';
import {startUi} from './ui-server.js';
const [command, input, output] = process.argv.slice(2);
try {
  if (command === 'ui') {
    startUi(Number(input) || 4173);
  } else if (!['generate','check','explain','validate'].includes(command) || !input || (output && command !== 'generate')) {
    console.error('Usage: nginxblock <generate|check|explain> model.json [output.conf] | nginxblock validate config.conf');
    process.exitCode = 2;
  } else if (command === 'validate') {
    const result = validateConfig(await readFile(input, 'utf8'));
    for (const issue of result.errors) console.error('ERROR' + (issue.line ? ' line ' + issue.line : '') + ': ' + issue.message);
    if (!result.valid) process.exitCode = 1;
    else console.log('Configuration structure is valid. Run nginx -t against the complete assembled configuration for semantic validation.');
  } else {
    const model = JSON.parse(await readFile(input,'utf8'));
    if (command === 'explain') console.log(JSON.stringify(explain(model),null,2));
    else {
      const result = generate(model);
      if (command === 'generate') {
        if (output) { await writeFile(output,result.config,{flag:'wx'}); console.error('Wrote ' + output); }
        else process.stdout.write(result.config);
      }
      for (const d of result.diagnostics) console.error(d.severity.toUpperCase() + ' ' + d.code + ' (' + d.path + '): ' + d.message);
      if (command === 'check') console.log('Model valid; ' + result.diagnostics.length + ' advisory warning(s). Run nginx -t against an installed, assembled configuration for syntax validation.');
    }
  }
} catch (e) {
  console.error('nginxblock: ' + e.message);
  process.exitCode = 1;
}
