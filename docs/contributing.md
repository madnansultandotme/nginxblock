# Contributing

Thank you for contributing to NginxBlock. Keep changes focused, secure, and compatible with the package's narrow responsibility: generating validated NGINX HTTP-context fragments from structured data.

## Before you start

Install Node.js 20 or newer, then install dependencies from the repository root:

```bash
npm ci
```

Run the existing checks before making changes:

```bash
npm test
npm run pack:check
```

## Repository layout

- `src/index.js`: model validation, configuration generation, and diagnostics.
- `src/config-validator.js`: structural validation for generated NGINX fragments.
- `src/cli.js`: command-line interface.
- `src/ui-server.js`: local UI server.
- `ui/`: browser UI assets.
- `examples/app.json`: complete example model.
- `test/index.test.js`: Node test suite.
- `.github/workflows/publish.yml`: automatic npm publishing workflow.
- `docs/`: user, publishing, and contribution documentation.

## Development principles

- Preserve the public API exported by `src/index.js` unless a breaking change is intentional and documented.
- Reject unknown or unsafe input instead of interpolating arbitrary NGINX directives.
- Keep generated output in HTTP context and document any new directive placement requirements.
- Use the existing validation helpers and error style where possible.
- Keep changes small and avoid unrelated formatting changes.
- Use ASCII in source and documentation unless a non-ASCII character is necessary.
- Do not add secrets, npm tokens, certificates, private keys, or generated package archives to the repository.

## Adding or changing model options

When adding a model option:

1. Add it to the relevant allow-list in `src/index.js`.
2. Validate its type, range, and safe character set.
3. Define how it interacts with HTTPS, routes, upstreams, caching, and rate limiting.
4. Add valid and invalid cases to `test/index.test.js`.
5. Update `docs/usage.md` and `examples/app.json` when the option is useful in a complete configuration.
6. Add parser coverage when generated syntax or block structure changes.
7. Run `npm test` and `npm run pack:check`.

Unknown keys are intentionally rejected. Do not silently accept a new option without validation and documentation.

## Tests

Tests use the Node.js built-in test runner:

```bash
npm test
```

Tests should cover both generated output and rejection behavior. For a new option, include at least one normal case and one invalid or incompatible case. Keep assertions focused on the public result, diagnostics, and error behavior.

## Package checks

The package contents are checked without creating a release:

```bash
npm run pack:check
```

Confirm that the package includes only the intended files from the `files` list and that the CLI entry remains available:

```bash
npm pkg get bin
npm pack --dry-run
```

Do not run a real `npm publish` while developing. Releases are performed by GitHub Actions with npm trusted publishing and provenance.

## Documentation

Update documentation when behavior, accepted model fields, generated directives, diagnostics, CLI commands, or release steps change. Keep examples executable or structurally consistent with the implementation.

Documentation files:

- `docs/usage.md` describes package use and the complete model surface.
- `docs/publishing.md` describes trusted publishing and release troubleshooting.
- `docs/contributing.md` describes development and review expectations.

## Pull requests

A useful pull request should include:

- A concise explanation of the behavior change.
- Tests for new behavior and failure cases.
- Updated documentation for user-visible changes.
- Confirmation that `npm test` and `npm run pack:check` pass.
- Notes about compatibility or migration when an API or generated configuration changes.

Do not commit directly to `main` unless repository policy explicitly allows it. The publishing workflow runs on pushes to `main`, so version changes should be reviewed before they reach that branch.

## Release changes

Package versions must be unique on npm. Use npm's version command for a release:

```bash
npm version patch
git push origin main --follow-tags
```

See [publishing.md](publishing.md) for the trusted publisher settings and release workflow details.
