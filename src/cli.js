#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {generate, explain} from './index.js';
import {startUi} from './ui-server.js';
const [command, input, output] = process.argv.slice(2);
try {
  if (command === 'ui') {
    startUi(Number(input) || 4173);
  } else if (!['generate','check','explain'].includes(command) || !input || (output && command !== 'generate')) {
    console.error('Usage: nginxblock <generate|check|explain> model.json [output.conf]');
    process.exitCode = 2;
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
