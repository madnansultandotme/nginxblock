# Publishing Guide

NginxBlock is published to npm by GitHub Actions using npm trusted publishing with OIDC. No npm token is stored in the repository.

## Current release flow

The workflow is [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).

A push to the `main` branch starts the workflow. The workflow:

1. Checks out the repository.
2. Installs Node.js 22.
3. Installs npm 11.5.1, which supports trusted publishing.
4. Installs the lockfile dependencies with `npm ci`.
5. Runs `npm test`.
6. Runs `npm run pack:check`.
7. Checks whether the package version is already present on npm.
8. Publishes with provenance when that version is not already published.

The workflow can also be started from the Actions tab with `workflow_dispatch`.

## Release a new version

npm does not allow the same package version to be published twice. Update the version before pushing a release commit:

```bash
npm version patch
```

Use `minor` or `major` when appropriate:

```bash
npm version minor
npm version major
```

Then push the commit and tag created by npm:

```bash
git push origin main --follow-tags
```

A normal push that does not change the package version will run the checks and skip publishing if that version already exists on npm.

## Trusted publishing configuration

On npm, configure a trusted publisher for the `nginxblock` package with these exact values:

- Provider: GitHub Actions
- Repository owner: `madnansultandotme`
- Repository name: `nginxblock`
- Workflow filename: `publish.yml`
- Environment: `nginxblock`

The workflow must keep both permissions below:

```yaml
permissions:
  contents: read
  id-token: write
```

The publishing job must also declare the configured environment:

```yaml
environment: nginxblock
```

If the npm trusted publisher is configured without an environment, remove the `environment` line from the workflow as well. The two sides must agree.

The GitHub repository must contain the workflow on the branch being pushed. After changing the workflow, commit and push it before testing a release.

## Package metadata required for provenance

`package.json` must identify the source repository so npm can compare the package metadata with the GitHub provenance statement:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/madnansultandotme/nginxblock"
}
```

The package also exposes the CLI through:

```json
"bin": "./src/cli.js"
```

Do not remove the repository metadata or the CLI entry when editing the manifest.

## Troubleshooting

### No workflow starts after a push

The workflow listens for pushes to `main`. Confirm the push reached `origin/main`, the workflow file is present on that branch, and Actions are enabled for the repository. A push to another branch will not start this workflow.

### OIDC permission denied

This means GitHub issued an OIDC token, but npm did not accept its identity. Verify the owner, repository, workflow filename, and environment in the npm trusted publisher configuration. `id-token: write` must be present in the workflow.

### Provenance repository mismatch

An error such as:

```text
package.json: "repository.url" is "", expected to match
"https://github.com/madnansultandotme/nginxblock"
```

means the `repository` field is missing or incorrect. Add the repository metadata shown above, commit it, and push again.

### Same version already exists

npm rejects a version that has already been published. Increase the version with `npm version patch`, `minor`, or `major`. The workflow's version check skips an already-published version rather than failing the job.

### CLI bin warning

The publish job pins npm 11.5.1 because newer npm normalization can incorrectly remove the CLI entry. Keep `bin` as `"./src/cli.js"` and verify the package with:

```bash
npm pack --dry-run
npm pkg get bin
```

### Tarball details in the log

`npm notice` lines showing the package name, version, file list, size, shasum, or provenance are informational. The actual failure is indicated by `npm error` and the process exit code.

## Manual checks

Before pushing a release:

```bash
npm test
npm run pack:check
npm pkg get version
npm pkg get repository
npm pkg get bin
```

Do not run `npm publish` locally for this package. Publishing is intended to happen through GitHub Actions so npm can attach trusted provenance.
