# NginxBlock

A small npm package for generating NGINX HTTP-context fragments from a structured JSON model. It includes advisory checks, a CLI, and a local browser UI for configuring and reviewing models. It supports HTTP/HTTPS server blocks, static routes, reverse proxies, upstream load balancing, WebSockets, basic proxy caching, rate limits, gzip, and selected security settings.

This package is a generator, not an arbitrary nginx.conf parser, deployment tool, certificate issuer, or substitute for nginx -t. Generated fragments belong inside an existing nginx http block or a file included from it. Certificate files, static roots, and the cache directory must exist and be accessible on the target host.

Detailed documentation is available in [docs/README.md](docs/README.md), including the user guide and automatic npm publishing setup.

## Install

    npm install nginxblock

Requires Node.js 20 or later. The npm name is a requested package name; registry availability has not been confirmed. This source bundle can also be installed locally with npm install ./nginxkit.

## CLI

    nginxblock ui

Open http://127.0.0.1:4173 in your browser to edit a model visually, preview generated configuration, review advisories, and download nginx.conf. Pass a port to use another one: nginxblock ui 8080.

    nginxblock generate examples/app.json > site.conf
    nginxblock check examples/app.json
    nginxblock explain examples/app.json
    nginxblock validate site.conf

Generate with a third output path to create a file without overwriting an existing one. Diagnostics print to stderr. Check validates the model and prints advisories; it does not call NGINX. For actual syntax validation, include the generated fragment in a complete configuration on the target system and run nginx -t.

## JavaScript API

    import { generate, explain } from 'nginxblock';
    const model = {domain:'example.com',routes:[{path:'/',type:'proxy',target:'localhost:3000'}]};
    const {config,diagnostics} = generate(model);
    console.log(config, diagnostics, explain(model));

See examples/app.json for TLS, load balancing, WebSockets and rate limiting.

## Model notes

- HTTPS requires certificate and certificateKey absolute paths. redirectHttp adds a separate port 80 server.
- Upstreams use round_robin (default), least_conn, or ip_hash; servers accept address, weight, backup, maxFails, and failTimeout.
- Routes require path and type (proxy or static). Proxy routes take target, optionally websocket, cache, cacheTtl (seconds), rateLimit with rate and burst (rate in requests/second), and allow (IP/CIDR list). Static routes take an absolute root and optional spa.
- All rate-limited routes share one global rate zone in v0.1. The default cache bypass checks Authorization and a cookie named session; audit application-specific cookies and responses before caching private endpoints.
- Location prefixes are emitted as written. Proxy pass without a URI retains the request URI. Static root uses standard NGINX root path concatenation; ensure your directory layout matches the route.
- Diagnostics are advisories, not proof of production readiness. Unsupported keys fail closed; no arbitrary NGINX directives are interpolated.
- The generated map, upstream, proxy_cache_path, and limit_req_zone directives must appear in HTTP context. Do not paste the whole output inside a server block.

## Development

    npm test
    npm run pack:check

MIT licensed.
