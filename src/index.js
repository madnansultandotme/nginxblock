const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;
const address = /^(?:[A-Za-z0-9._-]+|\[[0-9a-fA-F:]+\])(?::[0-9]{1,5})?$/;
const domain = /^[A-Za-z0-9*._-]+$/;
const routePath = /^\/[A-Za-z0-9/_~.%-]*$/;
function error(s) { throw new TypeError(s); }
function object(x, allowed, label) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) error(label + ' must be an object');
  for (const k of Object.keys(x)) if (!allowed.includes(k)) error('Unknown ' + label + ' option: ' + k);
}
function str(x, re, label) {
  if (typeof x !== 'string' || !re.test(x) || /[\r\n;]/.test(x)) error('Invalid ' + label);
  return x;
}
function num(x, lo, hi, label) {
  if (!Number.isInteger(x) || x < lo || x > hi) error('Invalid ' + label);
  return x;
}
function flag(x, label) { if (typeof x !== 'boolean') error('Invalid ' + label); return x; }
function array(x, label) { if (!Array.isArray(x)) error(label + ' must be an array'); return x; }
function file(x, label) {
  str(x, /^\/[A-Za-z0-9/_ .-]+$/, label);
  if (x.split('/').includes('..')) error('Invalid ' + label);
  return x;
}
function backend(x) {
  str(x, address, 'backend address');
  const port = x.match(/:(\d+)$/);
  if (port) num(Number(port[1]), 1, 65535, 'backend port');
  return x;
}
function proxyTarget(x) {
  str(x, /^(?:https?:\/\/)?(?:[A-Za-z0-9._-]+|\[[0-9a-fA-F:]+\])(?::[0-9]{1,5})?$/, 'proxy target');
  backend(x.replace(/^https?:\/\//, ''));
  return x.startsWith('http://') || x.startsWith('https://') ? x : 'http://' + x;
}
/** Generate an NGINX HTTP-context fragment. Throws TypeError for unsupported or unsafe input. */
export function generate(model) {
  object(model, ['domain','listen','https','certificate','certificateKey','redirectHttp','upstreams','routes','gzip','hideVersion','hsts','clientMaxBodySizeMb'], 'config');
  const d = str(model.domain, domain, 'domain');
  const tls = model.https === undefined ? false : flag(model.https, 'https');
  const port = num(model.listen ?? (tls ? 443 : 80), 1, 65535, 'listen');
  if (tls && port === 80) error('HTTPS cannot listen on port 80 in this model');
  if (model.redirectHttp && !tls) error('redirectHttp requires HTTPS');
  if (model.hsts && !tls) error('hsts requires HTTPS');
  if (tls && (!model.certificate || !model.certificateKey)) error('HTTPS requires certificate and certificateKey');
  if (!tls && (model.certificate || model.certificateKey)) error('Certificates require HTTPS');
  const lines = [], diagnostics = [], names = new Set(), rates = new Set();
  let hasCache = false, hasWebsocket = false;
  for (const [i,u] of array(model.upstreams ?? [], 'upstreams').entries()) {
    object(u, ['name','strategy','servers'], 'upstream ' + i);
    const n = str(u.name, ident, 'upstream name');
    if (names.has(n)) error('Duplicate upstream ' + n);
    names.add(n);
    const strategy = u.strategy ?? 'round_robin';
    if (!['round_robin','least_conn','ip_hash'].includes(strategy)) error('Invalid strategy');
    const servers = array(u.servers, 'servers');
    if (!servers.length) error('Upstream has no servers');
    lines.push('upstream ' + n + ' {');
    if (strategy !== 'round_robin') lines.push('    ' + strategy + ';');
    for (const s of servers) {
      object(s, ['address','weight','backup','maxFails','failTimeout'], 'server');
      let line = '    server ' + backend(s.address);
      if (s.weight !== undefined) line += ' weight=' + num(s.weight,1,10000,'weight');
      if (s.maxFails !== undefined) line += ' max_fails=' + num(s.maxFails,0,10000,'maxFails');
      if (s.failTimeout !== undefined) line += ' fail_timeout=' + num(s.failTimeout,1,86400,'failTimeout') + 's';
      if (s.backup !== undefined && flag(s.backup,'backup')) {
        if (strategy === 'ip_hash') error('backup is incompatible with ip_hash');
        line += ' backup';
      }
      lines.push(line + ';');
    }
    lines.push('}', '');
  }
  const locations = [], seen = new Set();
  const routes = array(model.routes, 'routes');
  if (!routes.length) error('At least one route is required');
  for (const [i,r] of routes.entries()) {
    object(r, ['path','type','target','root','spa','websocket','cache','cacheTtl','rateLimit','allow'], 'route ' + i);
    const p = str(r.path, routePath, 'route path');
    if (seen.has(p)) error('Duplicate route ' + p);
    seen.add(p);
    if (!['proxy','static'].includes(r.type)) error('Invalid route type');
    locations.push('    location ' + p + ' {');
    if (r.allow !== undefined) {
      for (const ip of array(r.allow,'allow')) locations.push('        allow ' + str(ip,/^[0-9a-fA-F:.]+(?:\/[0-9]{1,3})?$/,'IP/CIDR') + ';');
      locations.push('        deny all;');
    }
    if (r.rateLimit !== undefined) {
      object(r.rateLimit,['rate','burst'],'rateLimit');
      const rate = num(r.rateLimit.rate,1,100000,'rate');
      const burst = num(r.rateLimit.burst ?? 0,0,100000,'burst');
      rates.add(rate);
      locations.push('        limit_req zone=kit_limit burst=' + burst + ' nodelay;');
    }
    if (r.type === 'proxy') {
      if (r.root !== undefined || r.spa !== undefined) error('Static option on proxy route');
      const target = proxyTarget(r.target);
      const authority = target.replace(/^https?:\/\//,'');
      if (!names.has(authority) && !authority.includes('.') && !authority.includes(':') && authority !== 'localhost')
        diagnostics.push({code:'UNRESOLVED_UPSTREAM',severity:'warning',path:'routes[' + i + '].target',message:authority + ' may need an upstream definition or DNS record'});
      locations.push('        proxy_set_header Host $host;', '        proxy_set_header X-Real-IP $remote_addr;', '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', '        proxy_set_header X-Forwarded-Proto $scheme;');
      if (r.websocket !== undefined && flag(r.websocket,'websocket')) {
        hasWebsocket = true;
        locations.push('        proxy_http_version 1.1;', '        proxy_set_header Upgrade $http_upgrade;', '        proxy_set_header Connection $connection_upgrade;');
      }
      if (r.cache !== undefined && flag(r.cache,'cache')) {
        hasCache = true;
        locations.push('        proxy_cache kit_cache;', '        proxy_cache_valid 200 ' + num(r.cacheTtl ?? 60,1,86400,'cacheTtl') + 's;', '        proxy_no_cache $http_authorization $cookie_session;', '        proxy_cache_bypass $http_authorization $cookie_session;');
        if (/\/(?:auth|login|admin)(?:\/|$)/i.test(p))
          diagnostics.push({code:'SENSITIVE_CACHE',severity:'warning',path:'routes[' + i + '].cache',message:'Review caching on a sensitive route; private cookies may require additional bypass rules'});
      } else if (r.cacheTtl !== undefined) error('cacheTtl requires cache');
      locations.push('        proxy_pass ' + target + ';');
    } else {
      if (r.target !== undefined || r.websocket !== undefined || r.cache !== undefined || r.cacheTtl !== undefined) error('Proxy option on static route');
      locations.push('        root ' + file(r.root,'static root') + ';');
      if (r.spa !== undefined && flag(r.spa,'spa')) locations.push('        try_files $uri $uri/ /index.html;');
    }
    locations.push('    }', '');
  }
  if (rates.size > 1) error('This version supports one global rate only');
  if (rates.size) lines.push('limit_req_zone $binary_remote_addr zone=kit_limit:10m rate=' + [...rates][0] + 'r/s;', '');
  if (hasCache) lines.push('proxy_cache_path /var/cache/nginx/kit levels=1:2 keys_zone=kit_cache:10m inactive=60m;', '');
  if (hasWebsocket) lines.push('map $http_upgrade $connection_upgrade {', '    default upgrade;', "    '' close;", '}', '');
  if (model.redirectHttp) lines.push('server {','    listen 80;','    server_name ' + d + ';','    return 301 https://$host$request_uri;','}','');
  lines.push('server {','    listen ' + port + (tls ? ' ssl' : '') + ';','    server_name ' + d + ';');
  if (tls) lines.push('    ssl_certificate ' + file(model.certificate,'certificate') + ';','    ssl_certificate_key ' + file(model.certificateKey,'certificateKey') + ';','    ssl_protocols TLSv1.2 TLSv1.3;');
  if (model.hsts !== undefined && flag(model.hsts,'hsts')) lines.push('    add_header Strict-Transport-Security "max-age=31536000" always;');
  if (model.hideVersion !== undefined) lines.push('    server_tokens ' + (flag(model.hideVersion,'hideVersion') ? 'off' : 'on') + ';');
  if (model.gzip !== undefined) lines.push('    gzip ' + (flag(model.gzip,'gzip') ? 'on' : 'off') + ';');
  if (model.clientMaxBodySizeMb !== undefined) lines.push('    client_max_body_size ' + num(model.clientMaxBodySizeMb,1,10240,'clientMaxBodySizeMb') + 'M;');
  lines.push('',...locations,'}');
  if (!tls) diagnostics.push({code:'NO_HTTPS',severity:'warning',path:'https',message:'Configure TLS here or at a trusted edge'});
  if (tls && !model.redirectHttp) diagnostics.push({code:'NO_HTTP_REDIRECT',severity:'warning',path:'redirectHttp',message:'HTTP to HTTPS redirect is not configured'});
  return {config:lines.join('\n').replace(/\n{3,}/g,'\n\n') + '\n', diagnostics};
}
export function explain(model) {
  const {diagnostics} = generate(model);
  return {domain:model.domain, protocol:model.https ? 'HTTPS' : 'HTTP',
    routes:model.routes.map(r => ({path:r.path,type:r.type,destination:r.type === 'proxy' ? r.target : r.root})),
    upstreams:(model.upstreams ?? []).map(u => ({name:u.name,strategy:u.strategy ?? 'round_robin',servers:u.servers.map(s => s.address)})), diagnostics};
}
