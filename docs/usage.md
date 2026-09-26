# User Guide

## Requirements

- Node.js 20 or newer
- NGINX available on the target system when validating a complete configuration

## Installation

Install the published package:

```bash
npm install nginxblock
```

For a local checkout:

```bash
npm install ./nginxblock
```

## CLI

The package exposes the `nginxblock` command.

### Start the browser UI

```bash
nginxblock ui
```

Open `http://127.0.0.1:4173`. To select another port:

```bash
nginxblock ui 8080
```

The UI lets you edit a model, preview generated configuration, review diagnostics, and download the result.

### Generate configuration

```bash
nginxblock generate examples/app.json > site.conf
```

The command writes the generated fragment to standard output. To write a new file directly:

```bash
nginxblock generate examples/app.json site.conf
```

The output file is created without overwriting an existing file. Diagnostics are written to standard error.

### Check a model

```bash
nginxblock check examples/app.json
```

This validates the supported model shape and prints advisory diagnostics. It does not invoke NGINX and does not prove that a production configuration is safe.

### Explain diagnostics

```bash
nginxblock explain examples/app.json
```

This prints the advisory explanations for a model as JSON.

### Validate generated configuration

After generating a fragment, run the structural parser:

```bash
nginxblock generate examples/app.json site.conf
nginxblock validate site.conf
```

The parser checks balanced braces, quotes, directive terminators, supported block names, and the presence of `server` and `location` blocks. It catches common generated-file mistakes and reports line numbers. It is not a replacement for NGINX's own semantic parser.

## JavaScript API

```js
import { explain, generate } from 'nginxblock';

const model = {
  domain: 'example.com',
  routes: [
    {path: '/', type: 'proxy', target: 'localhost:3000'}
  ]
};

const {config, diagnostics} = generate(model);
console.log(config);
console.log(diagnostics);
console.log(explain(model));
```

`generate` returns the configuration fragment and diagnostics. `explain` returns the advisory explanations for the same model.

## Model basics

A model is JSON with a domain, optional listen and TLS settings, upstreams, and routes. See [`examples/app.json`](../examples/app.json) for a complete example.

### TLS and redirects

HTTPS requires both `certificate` and `certificateKey` absolute paths. Set `redirectHttp` to emit a separate port 80 redirect server.

### Upstreams

Upstreams support `round_robin` by default, plus `least_conn` and `ip_hash`. Servers can define an address, weight, backup, `maxFails`, and `failTimeout`.

### Routes

Every route has a `path` and a `type`:

- `proxy`: requires `target`; can enable WebSockets, caching, rate limiting, and IP allow lists.
- `static`: requires an absolute `root`; `spa` can enable single-page-application fallback behavior.

Route paths are emitted as written. Make sure the path and filesystem layout match the behavior you expect.

### Caching and rate limiting

Proxy caching supports `cache` and `cacheTtl`. The default cache bypass checks the `Authorization` header and a cookie named `session`; review application-specific cookies and responses before caching private endpoints.

All rate-limited routes share one global rate zone in the current implementation. Rate values are requests per second and `burst` controls the burst size.

## Complete model reference

The generator rejects unknown fields. The top-level model accepts:

| Field | Type and limits | Behavior |
| --- | --- | --- |
| `domain` | string matching letters, digits, `*`, `.`, `_`, or `-` | Required server name. |
| `listen` | integer from `1` to `65535` | Optional port. Defaults to `443` with HTTPS and `80` otherwise. |
| `https` | boolean | Enables TLS. Defaults to `false`. |
| `certificate` | absolute path | Required with HTTPS; cannot be used without HTTPS. |
| `certificateKey` | absolute path | Required with HTTPS; cannot be used without HTTPS. |
| `redirectHttp` | boolean | Adds a port 80 redirect to HTTPS. Requires HTTPS. |
| `upstreams` | array | Defines named backend pools. Defaults to an empty array. |
| `routes` | non-empty array | Defines locations. Required. |
| `gzip` | boolean | Emits `gzip on` or `gzip off`. |
| `hideVersion` | boolean | Emits `server_tokens off` or `on`. |
| `hsts` | boolean | Emits a one-year HSTS header. Requires HTTPS. |
| `clientMaxBodySizeMb` | integer from `1` to `10240` | Emits the client body-size limit in megabytes. |

Certificate and static-root paths must begin with `/`, may contain letters, digits, spaces, `_`, `.`, and `-`, and may not contain `..` path segments. This deliberately excludes shell metacharacters and relative paths.

### Upstream fields

Each upstream accepts `name`, `strategy`, and `servers`:

| Field | Type and limits | Behavior |
| --- | --- | --- |
| `name` | identifier beginning with a letter or `_`; remaining characters may be letters, digits, or `_` | Required and unique. |
| `strategy` | `round_robin`, `least_conn`, or `ip_hash` | Optional; defaults to `round_robin`. |
| `servers` | non-empty array | Required backend list. |

Each server accepts:

| Field | Type and limits | Behavior |
| --- | --- | --- |
| `address` | hostname, IPv4 address, bracketed IPv6 address, with optional port `1`-`65535` | Required backend address. |
| `weight` | integer from `1` to `10000` | Optional NGINX server weight. |
| `backup` | boolean | Optional backup server. Not compatible with `ip_hash` when true. |
| `maxFails` | integer from `0` to `10000` | Optional `max_fails` value. |
| `failTimeout` | integer from `1` to `86400` | Optional `fail_timeout` value in seconds. |

### Route fields

Every route accepts `path`, `type`, `allow`, and `rateLimit`. Paths must start with `/`, may contain letters, digits, `/`, `_`, `~`, `.`, `%`, and `-`, and must be unique.

Proxy routes (`type: "proxy"`) require `target`. Targets may include `http://` or `https://`, a hostname or IP address, and an optional port. A target without a scheme is emitted as HTTP. Proxy-only fields are `target`, `websocket`, `cache`, and `cacheTtl`.

Static routes (`type: "static"`) require an absolute `root`. They may use `spa`; proxy-only fields are rejected.

The shared route fields are:

| Field | Type and limits | Behavior |
| --- | --- | --- |
| `allow` | array of IPv4, IPv6, or CIDR strings | Emits `allow` rules followed by `deny all`. |
| `rateLimit.rate` | integer from `1` to `100000` | Required rate in requests per second. |
| `rateLimit.burst` | integer from `0` to `100000` | Optional burst size; defaults to `0`. |

Only one distinct rate is supported across all routes because the current generator emits one global `limit_req_zone`. Different route rates throw an error.

Proxy-specific fields behave as follows:

| Field | Type and limits | Behavior |
| --- | --- | --- |
| `websocket` | boolean | Adds HTTP/1.1 upgrade headers and a shared `map`. |
| `cache` | boolean | Adds shared proxy cache directives and bypasses authorization/session requests. |
| `cacheTtl` | integer from `1` to `86400` | Cache lifetime in seconds; requires `cache: true`. |

## Generated directives

Depending on the model, output can contain:

- `upstream` blocks and backend server options.
- A global `limit_req_zone` and per-location `limit_req` rules.
- A shared `proxy_cache_path` and per-location cache directives.
- A WebSocket `map` and upgrade headers.
- An HTTP-to-HTTPS redirect server.
- An HTTPS server with TLS 1.2 and TLS 1.3 settings.
- HSTS, server-version hiding, gzip, and client body-size directives.
- Proxy headers, `proxy_pass`, static roots, and SPA fallback rules.

## Diagnostics and errors

`generate` throws `TypeError` for invalid, unsupported, unsafe, duplicate, or incompatible input. Examples include unknown fields, duplicate routes or upstream names, missing routes or servers, invalid addresses, invalid paths, TLS settings without certificates, static options on proxy routes, proxy options on static routes, and incompatible `ip_hash` backups.

Valid models can still produce advisory diagnostics. Current diagnostic codes include:

| Code | Severity | Meaning |
| --- | --- | --- |
| `UNRESOLVED_UPSTREAM` | warning | A simple proxy target may require an upstream definition or DNS record. |
| `SENSITIVE_CACHE` | warning | A cache is enabled on a path such as `/auth`, `/login`, or `/admin`; review private data handling. |
| `NO_HTTPS` | warning | The model is not configured for HTTPS. |
| `NO_HTTP_REDIRECT` | warning | HTTPS is enabled without an HTTP-to-HTTPS redirect. |

Diagnostics are advisory and do not replace security review, application testing, or `nginx -t`.

## Validate a complete NGINX configuration

NginxBlock validates the model, not the final NGINX installation. Assemble the generated fragment into a complete HTTP configuration and run:

```bash
nginx -t -c /path/to/nginx.conf
```

Use `nginxblock validate` before this step for fast structural feedback, then use `nginx -t` for directive support, module availability, file paths, included files, ports, and the complete configuration context.

Certificate files, static roots, and cache directories must exist and be readable by the NGINX process.

## Development checks

From the repository root:

```bash
npm test
npm run pack:check
```

Unsupported model keys fail closed, and arbitrary NGINX directives are not interpolated into generated output.
