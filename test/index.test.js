import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generate,explain,validateConfig} from '../src/index.js';
const fixture = JSON.parse(readFileSync(new URL('../examples/app.json',import.meta.url),'utf8'));
test('generates coherent HTTP-context fragment', () => {
  const {config,diagnostics} = generate(fixture);
  assert.match(config,/upstream api \{\n    least_conn;/);
  assert.match(config,/limit_req_zone .*rate=10r\/s;/);
  assert.match(config,/map \$http_upgrade \$connection_upgrade/);
  assert.match(config,/proxy_pass http:\/\/api;/);
  assert.match(config,/listen 443 ssl;/);
  assert.match(config,/return 301 https:\/\/\$host\$request_uri;/);
  assert.deepEqual(diagnostics,[]);
  assert.equal(explain(fixture).routes.length,2);
});
test('refuses unsafe and unsupported input', () => {
  assert.throws(() => generate({...fixture,domain:'x;\ninclude /tmp/oops;'}),/Invalid domain/);
  assert.throws(() => generate({...fixture,unknown:true}),/Unknown/);
  assert.throws(() => generate({...fixture,routes:[{path:'/',type:'proxy',target:'api/evil'}]}),/Invalid proxy target/);
  assert.throws(() => generate({...fixture,upstreams:[{name:'bad;name',servers:[{address:'a'}]}]}),/Invalid upstream name/);
  assert.throws(() => generate({...fixture,certificateKey:'/tmp/../secret'}),/Invalid certificateKey/);
});
test('warns on sensitive caching and missing TLS', () => {
  const result=generate({domain:'example.com',routes:[{path:'/auth/',type:'proxy',target:'localhost:3000',cache:true}]});
  assert.deepEqual(result.diagnostics.map(x=>x.code),['SENSITIVE_CACHE','NO_HTTPS']);
  assert.match(result.config,/proxy_cache_bypass/);
});
test('rejects incompatible upstream options and differing rates', () => {
  assert.throws(() => generate({...fixture,upstreams:[{name:'a',strategy:'ip_hash',servers:[{address:'a:1',backup:true}]}]}),/incompatible/);
  assert.throws(() => generate({...fixture,routes:[{path:'/a',type:'proxy',target:'api',rateLimit:{rate:1}},{path:'/b',type:'proxy',target:'api',rateLimit:{rate:2}}]}),/one global rate/);
});
test('validates generated configuration structure', () => {
  assert.deepEqual(validateConfig(generate(fixture).config),{valid:true,errors:[]});
  const result = validateConfig('server {\n    location / {\n        proxy_pass http://api\n    }\n');
  assert.equal(result.valid,false);
  assert.match(result.errors.map(error => error.message).join(' '),/Directive must end/);
  assert.match(result.errors.map(error => error.message).join(' '),/Unbalanced braces/);
});
