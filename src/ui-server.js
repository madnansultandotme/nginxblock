import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {generate} from './index.js';

const uiRoot = fileURLToPath(new URL('../ui/', import.meta.url));
const contentTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};

function send(response, status, body, type='application/json; charset=utf-8') {
  response.writeHead(status, {'Content-Type':type, 'Cache-Control':'no-store'});
  response.end(body);
}

async function body(request) {
  let value = '';
  for await (const chunk of request) value += chunk;
  return JSON.parse(value);
}

export function startUi(port=4173, host='127.0.0.1') {
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'POST' && request.url === '/api/generate') {
        const model = await body(request);
        const result = generate(model);
        return send(response, 200, JSON.stringify(result));
      }
      const requestPath = request.url === '/' ? '/index.html' : request.url;
      const filePath = path.resolve(uiRoot, '.' + requestPath);
      if (!filePath.startsWith(path.resolve(uiRoot) + path.sep)) return send(response, 403, JSON.stringify({error:'Forbidden'}));
      const content = await readFile(filePath);
      return send(response, 200, content, contentTypes[path.extname(filePath)] ?? 'application/octet-stream');
    } catch (error) {
      const status = error instanceof SyntaxError || error instanceof TypeError ? 400 : 404;
      return send(response, status, JSON.stringify({error:error.message}));
    }
  });
  server.listen(port, host, () => {
    console.log('NginxBlock UI: http://' + host + ':' + port);
    console.log('Press Ctrl+C to stop.');
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startUi(Number(process.argv[2]) || 4173);
}
