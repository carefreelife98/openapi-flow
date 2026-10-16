# Dependency security review: 2026-10-16

## Scope and observed result

Review the installed dependency graph of the unreleased 0.2.0 libraries on Node.js 24.15.0/npm 11.12.1. The initial production audit reported six affected package entries: four high and two moderate. This count includes parent packages affected through a dependency; it is not six distinct vulnerabilities or six demonstrated exploits.

Update the declaring parent packages rather than overriding their children:

| Declaring package        | Before | After   | Affected child after update                   |
| ------------------------ | ------ | ------- | --------------------------------------------- |
| `@scalar/openapi-parser` | 0.29.7 | 0.29.13 | `@scalar/json-magic@0.15.7` → `undici@7.29.1` |
| `@n8n/workflow-sdk`      | 0.33.1 | 0.36.4  | `n8n-workflow@2.43.4` → `axios@1.20.0`        |

Both `npm audit --omit=dev` and the full `npm audit` report zero known vulnerabilities after the update. The checked registry was `https://registry.npmjs.org`. No `overrides`, forced dependency downgrade, skipped declaration check, suppressed advisory or automatic error recovery was added.

The undici advisory [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) identifies affected 7.x versions before 7.29.1. Axios advisory [GHSA-mghh-pgcx-3jjj](https://github.com/advisories/GHSA-mghh-pgcx-3jjj) identifies affected versions before 1.20.0. The audit also included other advisories against the same installed children; retain the complete machine reports rather than treating these two links as the whole advisory list.

## Inspected execution boundaries

`createApiCatalog` calls `validateAndResolveOpenApiDocument` in `packages/core/src/openapi/common/validate-spec.ts`. It first validates the JSON document with the standalone Scalar validator, then calls the parser's `validate` API for reference resolution. The inspected parser implementation uses `makeFilesystem` and `resolveReferences`. The separate json-magic fetch plugin imports undici for public URL fetching, but the presence of that dependency alone does not show that our object-input validation path exercises every affected undici feature. No claim of successful exploitation or blanket unreachability is made.

`buildN8nWorkflow` in `packages/n8n/src/workflow/build-n8n-workflow.ts` creates SDK nodes, builds the graph and returns validated workflow JSON. Importing this library is not authorization to execute that workflow or contact a business API. Axios is a dependency of n8n-workflow; the reviewed builder path does not itself call Axios. Updating the chain still removes the known affected version for consumers and other SDK paths.

This review does not disable or redesign the host's URL, credential, untrusted-input or execution policies. Generated workflows run inside the consumer's separately managed n8n instance. Its installed packages and security posture are outside this npm graph audit.

## Public declaration compatibility

The new SDK exposes additional declaration references: SDK lint declarations import `estree`; `@n8n/utils` imports SemVer types; `@n8n/errors` imports Sentry's `Event` type. The first clean consumer of the updated SDK failed on these seven declaration diagnostics. The original failure report is retained.

The adapter now declares `@types/estree@1.0.8`, `@types/semver@7.7.0` and `@sentry/node@10.70.0` in `dependencies`, following the corresponding upstream manifests. It also updates the existing config declaration dependency to `@n8n/config@2.41.2`. No source-level type shims or consumer-side repair installations are used. Existing Express, JSON Schema, Luxon, SSH2 and nock declaration dependencies remain explicit.

## Verification and evidence

The full repository typecheck, lint, formatting check, 424 unit regressions and 22 real-OAS regressions passed. The independent tarball consumer also passed: it installs with `--omit=dev --ignore-scripts`, has no workspace symlinks, and checks TypeScript with `strict: true`, `skipLibCheck: false` before compiling a workflow from an actual ICL OAS. The isolated request-binding n8n regression passed four cases: first and changed source IDs each reached five dependent requests, while missing and wrong-type source fields stopped after the source request. No real business API or remote n8n instance was used.

Local machine reports are under `.local-artifacts/security-audit-2026-10-16/` and `.local-artifacts/packed-consumer/`. These artifacts and private OAS files are not published. The seven-error intermediate strict-consumer failure is `2026-10-16T01-41-31-915Z.json`; the later passing run is `2026-10-16T01-43-20-092Z.json`, separate evidence rather than a replacement for that failure.

Zero registry audit findings means no known advisory was reported for this checked graph at this time. It does not prove that every dependency is vulnerability-free, that every future installation resolves identically, that every generated workflow is safe, or that end-to-end model quality is ready for release. New-contract/less-guided quality evaluation and release approval remain separate work.
