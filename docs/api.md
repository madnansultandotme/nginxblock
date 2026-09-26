# Code, API, and Functionality Guide

This guide explains what the code does, how the modules fit together, and how to use each public entry point.

## What NginxBlock does

NginxBlock accepts a JSON-compatible JavaScript object and generates an NGINX fragment for the HTTP context. It can describe:

- HTTP or HTTPS server blocks.
- HTTP-to-HTTPS redirects.
- Static file sites and single-page applications.
- Reverse-proxy routes.
- Named upstream pools with load-balancing strategies.
- WebSocket proxying.
- Basic proxy caching.
- Request rate limiting.
- IP allow lists.
- gzip, HSTS, server-version hiding, and request body limits.
- Advisory diagnostics for risky or incomplete configurations.

It does not install NGINX, create certificates, deploy files, or replace NGINX's own semantic configuration validator. Its `validateConfig` parser checks the structure of a generated fragment; `nginx -t` remains necessary for the complete assembled configuration.

## Source code map

### `src/index.js`

This is the core library and the public API. It validates model input, builds NGINX directives, and returns diagnostics.

- `generate(model)`: validates a model and returns `{config, diagnostics}`.
- `explain(model)`: runs the same generation validation and returns a compact summary containing the domain, protocol, routes, upstreams, and diagnostics.
- `validateConfig(config)`: checks a generated fragment's quotes, braces, directive terminators, block names, and required `server` and `location` blocks.

The module deliberately rejects unknown fields and unsafe values. The generated configuration is built from validated values rather than accepting arbitrary directive text.

### `src/cli.js`

This is the executable behind the `nginxblock` command. It reads JSON files, calls the core API, and writes configuration or diagnostics.

Supported commands are `ui`, `generate`, `check`, and `explain`.

### `src/ui-server.js`

This starts the local server used by the browser UI. It serves the files under `ui/` and provides the local editing experience; configuration generation remains owned by the core library.

### `ui/`

The browser interface provides form controls for the model, a generated-configuration preview, diagnostic status, copy-to-clipboard, and download actions.

### `examples/app.json`

This is a complete model showing HTTPS, an HTTP redirect, an upstream, a WebSocket-capable proxy route, rate limiting, and a static SPA route.

## JavaScript API

### `generate(model)`

Use `generate` when an application needs the generated configuration and diagnostics:

```js
import {generate} from 'nginxblock';

const model = {
  domain: 'app.example.com',
  https: true,
  certificate: '/etc/letsencrypt/live/app.example.com/fullchain.pem',
  certificateKey: '/etc/letsencrypt/live/app.example.com/privkey.pem',
  routes: [
    {path: '/', type: 'proxy', target: 'localhost:3000'}
  ]
};

const result = generate(model);
console.log(result.config);
console.table(result.diagnostics);
```

The result has this shape:

```js
{
  config: 'server { ... }\\n',
  diagnostics: [
    {
      code: 'NO_HTTP_REDIRECT',
      severity: 'warning',
      path: 'redirectHttp',
      message: 'HTTP to HTTPS redirect is not configured'
    }
  ]
}
```

`generate` throws a `TypeError` when the model is invalid. Catch the error at an application boundary if invalid user input should be displayed instead of terminating the process:

```js
try {
  const result = generate(model);
  process.stdout.write(result.config);
} catch (error) {
  console.error(error.message);
}
```

### `explain(model)`

Use `explain` when an application needs a summary for a review screen or audit log:

```js
import {explain} from 'nginxblock';

const summary = explain(model);
console.log(JSON.stringify(summary, null, 2));
```

The summary includes:

- `domain` from the model.
- `protocol`, either `HTTP` or `HTTPS`.
- `routes`, with each route's path, type, and destination.
- `upstreams`, with each name, strategy, and server address.
- `diagnostics`, using the same advisory objects returned by `generate`.

`explain` calls the same generator validation, so invalid models still throw errors.

## CLI functionality

### Generate a fragment

```bash
nginxblock generate examples/app.json > site.conf
```

This writes configuration to standard output. It is useful in shell pipelines and deployment scripts. To create a file directly without overwriting an existing file:

```bash
nginxblock generate examples/app.json site.conf
```

The CLI prints diagnostics to standard error so the generated configuration can still be redirected cleanly.

### Validate input and review warnings

```bash
nginxblock check examples/app.json
```

This checks the model and prints advisory warnings. It does not run `nginx -t` because the generator does not know the complete server configuration or target filesystem.

### Produce a review summary

```bash
nginxblock explain examples/app.json
```

This prints a JSON summary that is useful for inspecting routes and upstreams without reading the entire generated fragment.

### Validate a generated fragment

```bash
nginxblock generate examples/app.json site.conf
nginxblock validate site.conf
```

The validator reports line-numbered structural errors such as unbalanced braces, unclosed quotes, missing directive semicolons, unsupported block names, and missing `server` or `location` blocks. A successful result means the fragment has the expected structure; it does not prove that every directive is supported by the installed NGINX version or that referenced files and modules exist.

For complete semantic validation, include the fragment in a complete NGINX configuration and run:

```bash
nginx -t -c /path/to/nginx.conf
```

### Use the local UI

```bash
nginxblock ui
```

Then open `http://127.0.0.1:4173`. To choose another port:

```bash
nginxblock ui 8080
```

The UI is intended for interactive configuration review. After editing, inspect the generated output and diagnostics, copy the fragment, or download it as a configuration file.

## Functionality by configuration area

### Server and TLS

Set `domain` and optionally `listen`. Without `https`, the default port is 80. With `https: true`, the default port is 443 and both certificate paths are required. `redirectHttp: true` adds a separate port 80 server that redirects to HTTPS.

`hsts` adds a one-year `Strict-Transport-Security` header and therefore requires HTTPS. `hideVersion` controls `server_tokens`. `gzip` controls gzip. `clientMaxBodySizeMb` emits `client_max_body_size`.

### Upstreams and load balancing

Define a named upstream and reference it from a proxy route:

```js
const model = {
  domain: 'app.example.com',
  upstreams: [
    {
      name: 'api',
      strategy: 'least_conn',
      servers: [
        {address: '10.0.0.10:5000'},
        {address: '10.0.0.11:5000', weight: 2}
      ]
    }
  ],
  routes: [
    {path: '/api/', type: 'proxy', target: 'api'}
  ]
};
```

Supported strategies are `round_robin`, `least_conn`, and `ip_hash`. The default round-robin strategy does not need an explicit directive in the output. Upstream names must be unique and server lists cannot be empty.

### Proxy routes

A proxy route requires a target such as `api`, `localhost:3000`, or `https://service.example.com`. The generator adds standard forwarding headers and emits `proxy_pass`.

Set `websocket: true` for WebSocket upgrade headers. Set `cache: true` to use the shared cache and optionally set `cacheTtl` in seconds. Cache bypass is emitted for authorization headers and the `session` cookie, but applications should review all private-data cookies and response headers themselves.

### Static routes

A static route requires an absolute `root`:

```js
{
  path: '/',
  type: 'static',
  root: '/srv/app',
  spa: true
}
```

`spa: true` emits a `try_files` fallback to `/index.html`. Static routes cannot use proxy fields.

### Rate limits and access rules

Add `allow` with IPv4, IPv6, or CIDR strings to emit allow rules followed by `deny all`:

```js
{
  path: '/admin/',
  type: 'proxy',
  target: 'api',
  allow: ['10.0.0.0/8', '192.168.1.20']
}
```

Add `rateLimit` to a route:

```js
rateLimit: {rate: 10, burst: 20}
```

The generator emits one global rate zone. All rate-limited routes must use the same `rate`, while `burst` can differ.

## Validation and safety behavior

The validator rejects:

- Unknown top-level, upstream, server, or route fields.
- Newline, semicolon, and unsafe characters in string values.
- Invalid domains, route paths, addresses, ports, identifiers, IP values, and filesystem paths.
- Relative certificate and static-root paths.
- Path traversal using `..` segments.
- Duplicate upstream names or route paths.
- Empty route or upstream-server arrays.
- HTTPS without both certificate paths.
- Certificates, HSTS, or HTTP redirects in incompatible HTTP-only models.
- Proxy fields on static routes and static fields on proxy routes.
- More than one global rate value.
- Backup servers with `ip_hash`.

These checks reduce configuration injection risk, but they are not a complete security review. Always review generated configuration and validate a complete assembled configuration with `nginx -t` on the target system.

## Typical end-to-end workflow

1. Copy `examples/app.json` or create a model in the UI.
2. Run `nginxblock check model.json` and review diagnostics.
3. Run `nginxblock generate model.json > site.conf`.
4. Include the fragment inside the target NGINX `http` block.
5. Run `nginx -t` against the complete configuration.
6. Reload NGINX using the operating system's service procedure.
7. Keep the model and generated configuration under version control where appropriate.
