# NginxBlock Documentation

NginxBlock generates NGINX HTTP-context fragments from a structured JSON model. It includes a JavaScript API, a command-line interface, and a local browser UI.

## Guides

- [Code, API, and functionality guide](api.md): source modules, JavaScript APIs, CLI commands, UI behavior, configuration features, and validation.
- [User guide](usage.md): installation, CLI commands, model structure, generated configuration, and validation.
- [Publishing guide](publishing.md): development checks, automatic npm publishing, trusted publishing setup, and troubleshooting.
- [Contribution guide](contribution.md): a quick contribution checklist.
- [Contributing guide](contributing.md): repository layout, development rules, tests, documentation, and pull requests.

## Important boundaries

NginxBlock is a configuration generator. It is not an NGINX configuration parser, deployment tool, certificate issuer, or replacement for `nginx -t`.

Generated output belongs inside an existing NGINX `http` block or in a file included from that block. The generated `map`, `upstream`, `proxy_cache_path`, and `limit_req_zone` directives must remain in HTTP context; do not paste the complete output inside a `server` block.
