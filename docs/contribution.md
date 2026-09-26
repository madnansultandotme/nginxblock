# Contribution Guide

This is the contribution entry point for NginxBlock. The full maintainer guide is in [contributing.md](contributing.md).

## Quick checklist

1. Use Node.js 20 or newer.
2. Install dependencies with `npm ci`.
3. Keep model validation strict and reject unknown or unsafe fields.
4. Add tests for valid behavior and invalid or incompatible input.
5. Update [usage.md](usage.md) when the public model, CLI, API, or generated NGINX output changes.
6. Run `npm test` and `npm run pack:check`.
7. Do not commit secrets, npm tokens, certificates, private keys, or package archives.
8. Review release changes before pushing to `main`, because pushes to `main` run the npm publishing workflow.

See [contributing.md](contributing.md) for repository layout, development principles, model-option changes, test expectations, documentation rules, pull requests, and release procedures.
