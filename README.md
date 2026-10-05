# openapi-flow

An importable Node.js library that selects an OpenAPI operation from a natural-language scenario, checks the selected operation against the supplied contract, and builds an n8n workflow with the official workflow SDK. It does not run an HTTP server, execute the workflow, or publish it to n8n.

The importable package is published as [`@openapi-flow/core`](https://www.npmjs.com/package/@openapi-flow/core). Its own code is MIT-licensed. The n8n SDK is a separate dependency under [n8n's Sustainable Use License](https://docs.n8n.io/n8n-community-license/); the MIT license does not change that dependency's terms.

The latest published package is `0.1.0`. This `main` branch contains newer, unreleased API and workflow-generation changes; the examples below describe the repository source until a new version is published.

To trace the current implementation from the public API through OAS parsing, LangChain planning, and n8n workflow construction, see the [Korean code walkthrough](docs/code-walkthrough.ko.md).

For the proposed independent selection, argument-generation, graph-planning, and n8n-compilation APIs, see the [composable API redesign](docs/composable-api-design.ko.md). This is a design document, not an implemented or published API; the examples below still describe the current source.

The repository root is a private npm workspace; the importable library lives in `packages/core/`. Its public exports are declared in `packages/core/src/public-api.ts` (there is no server or `index.tsx`). Named types live in `src/types/`; LangChain structured-output schemas live in `src/schemas/`; model selection and value extraction live in `src/planning/`. `src/utils/` contains only domain-neutral helpers.

OAS operation sources are separate from n8n node types. `paths` operations produce an HTTP Request node; both top-level `webhooks` and operation `callbacks` currently produce a Webhook trigger followed by Respond to Webhook. A callback also retains its parent operation and URL expression; its expression is **not** the n8n webhook path. The source layout follows the actual ownership boundaries:

```text
packages/core/src/
  public-api.ts       package export boundary
  openapi/
    common/           OAS validation, references, metadata, schema checks
    request/          paths operations, request parameter/body/response parsing and serialization
    inbound/          shared inbound candidate extraction and listing
      webhook/        top-level webhooks extraction
      callback/       operation callbacks extraction and parent reference
  planning/           model-based operation selection and input planning
  schemas/            structured-output schemas for OAS-derived planning
  workflow/
    common/           plan serialization and workflow identity
    request/          outgoing URL/body/header preparation, policy, and separate workflow builders
    inbound/          inbound plan validation, OAS response checks, and Webhook-node assembly
  types/              named OAS, request, sequence, planning and inbound contracts
  utils/              domain-neutral object guard
```

`inboundOperationsFromSpec` and `compileInboundWorkflow` remain the public entry points. Webhook and callback have distinct OAS extractors; both use the same inbound n8n compilation because the generated node sequence is currently identical. Single-request and sequence compilers keep plan preparation separate from n8n workflow construction. Shared compilation does not imply that callback registration or correlation is implemented.

## Current API

Use Node.js 24 or later. The host application supplies an OAS JSON object and a LangChain chat model (for example `ChatOpenAI` configured with an OpenAI-compatible endpoint such as Chomsky):

```sh
npm install @openapi-flow/core @langchain/core @langchain/openai
```

```ts
import { readFile } from 'node:fs/promises';
import { ChatOpenAI } from '@langchain/openai';
import { generateWorkflow } from '@openapi-flow/core';

const openApiJson = JSON.parse(await readFile('./openapi.json', 'utf8'));
const model = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.LLM_API_KEY,
  configuration: { baseURL: process.env.LLM_BASE_URL },
});

const result = await generateWorkflow({
  spec: openApiJson,
  scenario: 'Read item 42',
  model,
  baseUrl: 'https://api.example.com',
  profile: 'read-only',
  effectPolicy: { '#/paths/~1items~1{id}/get': 'read' },
  credentialBindings: {},
});

if (result.status === 'complete') {
  // Review result.plan, result.evidence, and result.workflow before import.
  console.log(result.workflow);
} else {
  console.log(result.status, result.missingInputs, result.evidence);
}
```

The model first chooses an OAS `operationRef` (a JSON Pointer to a path operation) using the operation's method, path, summary, description, and tags. A second structured response extracts only request parameter and body values explicitly supplied by the scenario. Its nested Zod output schema is built from the selected OAS operation's parameter and request-body schemas, so values are typed JSON rather than JSON encoded inside strings. Missing scenario values may be omitted; the compiler checks OAS-required values and reports `needs_input`. Response assertions are not model-planned: the host may supply `expectedBody` to `generateWorkflow` explicitly. It does not plan or assert a response status. For a normal request, the generated workflow has a Manual Trigger and an HTTP Request node, and the OAS may declare multiple possible responses. Status wording in a scenario does not add a status assertion. The host-supplied model receives the operation catalogue and selected operation request schemas, so the host must approve that data flow before using `generateWorkflow` with a remote provider. `operationId` is optional metadata, not required input. Every proposed field and value is validated against the selected OAS operation. It cannot choose a URL or author n8n node code. The host must keep secrets out of scenarios and literal inputs; authenticated operations refer only to existing n8n credentials by ID and name. `baseUrl` is a required trusted HTTP(S) deployment URL supplied by the host application; an optional path prefix is preserved, and the library does not use OAS `servers`. To skip the model or supply missing inputs explicitly, call `await compileWorkflow({ spec, baseUrl, profile, effectPolicy, credentialBindings, plan })` with a version-`1` plan:

```ts
const plan = {
  version: '1',
  goal: 'Read item 42',
  operationRef: '#/paths/~1items~1{id}/get',
  inputs: { 'path.id': '42' },
  // Only for an explicit response body expectation:
  // expectedBody: { available: true },
};
```

The trusted host, not the OAS document or model, supplies `effectPolicy`, a map from canonical `operationRef` to approved `read` or `write` effect. A missing entry is `unknown` and returns `blocked`; `read-only` blocks writes, while `test` permits explicitly approved writes. No `x-openapi-flow-effect` annotation is needed. `test` does **not** execute the workflow. Missing required inputs return `needs_input` with no workflow. Invalid or unsupported selected-operation data throws a source-specific error.

For an operation whose OAS `security` selects an HTTP Bearer scheme, the host supplies `credentialBindings` keyed by the OAS security-scheme name. For example, `credentialBindings: { bearerAuth: { id: 'existing-n8n-credential-id', name: 'Bearer for staging' } }` links the generated HTTP Request node to an existing n8n credential. The ID and name are references, not a token; the host must verify that the credential exists on the target n8n instance and is accessible to the importing workflow. Missing bindings fail compilation. Use `{}` when the selected operation needs no authentication. Do not put token values in the plan or bindings.

For an explicitly planned linear workflow, `compileSequence` can bind a prior response field to a later path or query parameter:

```ts
import { compileSequence } from '@openapi-flow/core';

const result = await compileSequence({
  spec: openApiJson,
  baseUrl: 'https://api.example.com',
  profile: 'test',
  effectPolicy: {
    '#/paths/~1items/post': 'write',
    '#/paths/~1items~1{id}/get': 'read',
  },
  credentialBindings: {},
  plan: {
    version: '1',
    goal: 'Create an item and read it back',
    steps: [
      {
        id: 'create',
        operationRef: '#/paths/~1items/post',
        inputs: { body: { name: 'demo' } },
      },
      {
        id: 'read',
        operationRef: '#/paths/~1items~1{id}/get',
        inputs: { 'path.id': { fromStep: 'create', field: 'id' } },
        expectedBody: { ok: true },
      },
    ],
  },
});
```

References must point to an earlier step and a declared response field of a compatible primitive type. The source assertion fails if the field is missing at runtime. This single-document plan is host-supplied; multi-document model planning is described below.

### Multi-document scenarios

The host supplies each service's OAS, trusted deployment URL, effect policy, and existing n8n credential references. No manifest or server process is required. `documentId` distinguishes identical `operationRef` values in different documents. `proposeCatalogScenario` returns an inspectable plan for a caller-owned LangGraph/HITL loop; `compileCatalogSequence` validates and compiles a reviewed or edited plan. `generateCatalogScenario` performs both calls for a simple path:

```ts
import {
  proposeCatalogScenario,
  compileCatalogSequence,
} from '@openapi-flow/core';

const sources = [
  {
    id: 'inventory',
    spec: inventoryOpenApiJson,
    baseUrl: 'https://inventory.example.com',
    effectPolicy: { '#/paths/~1items/post': 'write' },
    credentialBindings: {},
  },
  {
    id: 'lookup',
    spec: lookupOpenApiJson,
    baseUrl: 'https://lookup.example.com',
    effectPolicy: { '#/paths/~1items~1{id}/get': 'read' },
    credentialBindings: {},
  },
];

const plan = await proposeCatalogScenario({
  sources,
  scenario: 'Create an item named demo and read the created item',
  model,
});
// Review, edit, or request another plan in the host application.
const result = await compileCatalogSequence({ sources, profile: 'test', plan });
if (result.status === 'complete') {
  // Import result.workflow only after host review.
  console.log(result.workflow);
} else {
  console.log(result.status, result.diagnostics);
}
```

The first structured model call chooses an ordered list of catalog candidates and may propose unmet requirements. A typed call per selected operation extracts literal OAS request values and optional prior-response-to-path/query bindings. The model receives metadata for every catalog operation and request/response contract data for selected operations; the host must approve that disclosure to its model endpoint. The compiler rechecks every selected operation, input, response reference, effect, and credential. It emits Manual Trigger → HTTP Request nodes with Code checks only where a response binding or explicit host assertion requires one. `missing_operation`, `insufficient_contract`, `missing_input`, and `effect_not_approved` are diagnostics, not executable substitute nodes. An `insufficient_contract` gap identifies the existing `(documentId, operationRef)` that may need enhancement. A plan with a proposed capability gap returns `needs_capability` and **no workflow**, even if some steps are valid. Gap descriptions are model proposals for human review, not proof that an API is absent. The host owns retries, approvals, policy, n8n import, and execution.

## Document validation and workflow generation

- `validateOpenApi(spec)` checks a JSON object against Scalar's OpenAPI schema validator. It does not impose a project-specific version, byte-size, method, operation-count, or `operationId` requirement. It accepts standard external `$ref` syntax without fetching referenced documents. A missing required OAS field fails validation rather than being filled in automatically.
- `operationsFromSpec(spec)` resolves references and lists outgoing `paths` operations, including operations without `operationId`; each candidate has `source: 'paths'` and a canonical `operationRef`. `inboundOperationsFromSpec(spec)` separately lists OAS `webhooks` and operation `callbacks` with their own canonical references and source. Listing does not require every operation to be convertible to n8n. Both APIs take one in-memory document; callers must bundle external references first. The library does not fetch remote URLs automatically.
- Natural-language selection and value extraction use Zod schemas. Zod 4 converts the selected operation's OAS parameter and body schemas to typed planning fields. The operation-selection call uses `method: 'jsonSchema'`; the input-planning call passes its Zod schema directly with `method: 'functionCalling'` and no `strict` option, then validates the response locally. The selected operation is already fixed and application code consumes the proposed inputs. Current ChatOpenAI forces `strict: true` for Zod 4 on its `jsonSchema` path, which conflicts with omitted scenario values and valid OAS constraints. Planning fields may be omitted when the scenario lacks a value. The compiler separately checks the complete original OAS contract and enforces host-supplied effect and credential policy. Zod cannot establish whether a value was actually stated in the scenario. The selected OAS schema must be convertible by Zod's `fromJSONSchema`; conversion errors identify the selected field.
- Outgoing generation remains narrower than document acceptance: selected operations support no authentication or one HTTP Bearer requirement backed by an existing n8n credential; scalar, array, and flat-object path/query/header/cookie styles; JSON parameter content; JSON request bodies; and form-urlencoded bodies with scalar fields, repeated arrays, JSON-encoded complex values, or explicitly styled fields. If OAS declares multiple request media types, the plan must supply `requestMediaType` (or the host supplies it to `generateWorkflow`); without a choice the result is `needs_input`, not an invalid document. Other security schemes, combined schemes, alternative security requirements, nested `deepObject`, nested form encoding, binary/multipart bodies, and unmapped media types fail explicitly for the selected operation. JSON request bodies and explicitly requested top-level response assertions are checked against their OAS schemas. Known unsupported conversion features throw `UnsupportedOperationError` with the selected `operationRef`; OAS validation failures and missing host credential bindings remain separate errors. Unrelated valid OAS operations do not make the document invalid. The SDK normally emits Manual Trigger → HTTP Request and adds a Code assertion node only when needed.
- The compiler accepts exact, ranged, and `default` OAS response entries without selecting a status. Assertions can compare top-level response fields containing nested JSON values. Linear plans have no project-specific step-count cap, and prior-response bindings are currently for primitive path/query values.

`generateWorkflow` still handles one outgoing path operation per workflow; `proposeCatalogScenario` and `generateCatalogScenario` handle ordered multi-document path operations. Inbound generation is separate and host-planned: `compileInboundWorkflow` creates an unauthenticated [Webhook trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) → [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/) workflow from a selected webhook or callback. The host must supply the n8n webhook path, an OAS-declared response status, and an OAS-valid JSON response body if used. The library does not derive the public callback URL, register it with the API provider, correlate callback requests with the parent operation, enforce inbound request schemas, map inbound authentication, or publish the workflow. A selected inbound operation with an OAS security requirement fails instead of silently creating an unauthenticated endpoint. Review network exposure before publishing.

```ts
import { inboundOperationsFromSpec, compileInboundWorkflow } from '@openapi-flow/core';

const candidate = (await inboundOperationsFromSpec(openApiJson)).find(
  (operation) => operation.source === 'webhooks',
);
if (!candidate) throw new Error('No OAS webhook operation found');

const inbound = await compileInboundWorkflow({
  spec: openApiJson,
  plan: {
    version: '1',
    goal: 'Acknowledge an event',
    operationRef: candidate.operationRef,
    webhookPath: 'events/received',
    responseStatus: 202,
    responseBody: { ok: true },
  },
});
```

The library does not yet support n8n wait/branch/merge orchestration, model-planned response assertions, YAML input, all OAS authentication schemes, all serialization/media types, instance-level n8n MCP validation, remote draft creation, or execution. Sequence response-field references currently bind only primitive path/query inputs. No LangGraph loop or HITL UI is bundled; the proposal and compiler are separate so a host can implement those flows. These are conversion capabilities, not restrictions on whether the OAS document is valid. The trusted `baseUrl`, effect approvals, and credential references are supplied by the host, so review remains necessary before importing or running a workflow against a production API.

The opt-in `npm run test:live-model-local-n8n` smoke test calls a host-supplied OpenAI-compatible model twice per scenario, imports each generated workflow into a disposable local n8n instance, executes it, and checks the execution status and HTTP request received by a local responder. Set `LLM_BASE_URL`, `LLM_API_KEY`, and `MODEL_NAME`; set `LLM_MODEL_HEADER_NAME` if the endpoint requires a model-name header. The built-in cases cover a typed GET path/query and a POST JSON body. To add a private OAS case, supply `OPENAPI_FLOW_REAL_CASE_JSON` with `specFile`, `scenario`, `profile`, `effect`, `expectedRef`, `expectedInputs`, and `expectedRequest` (method, URL, body). Keep this JSON and all credentials outside the public repository. The test never calls the service described by the OAS; it replaces the deployment URL with its own local responder.

The mapping was checked against the [published OAS 3.2.1 specification](https://spec.openapis.org/oas/v3.2.1.html) and n8n's [HTTP Request V3 node definition](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/Description.ts) and [runtime implementation](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts). The current source definition lists node version 4.3, used by this package, alongside newer versions. Upstream `master` can change; a target n8n instance must be checked separately. Unit tests inspect emitted workflow parameters and OAS validation; the focused local n8n smoke test also inspects received HTTP requests. Neither check proves every OAS contract can execute on another target n8n instance.

For a focused runtime check, the `n8nio/n8n:2.37.10` image's installed HTTP Request description exposed the seven standard methods used by this compiler. Earlier disposable-container runs exercised a header/cookie GET. The repeatable `npm run test:local-n8n` check imports generated matrix-path/repeated-query, complex form POST, and cross-document response-binding workflows and runs them against a local synthetic HTTP responder. It also publishes generated webhook and callback workflows in a disposable local n8n instance and calls both production webhook URLs over HTTP. n8n's form-urlencoded string mode collapsed repeated fields in this test, so the compiler sends the already-serialized form body through the Raw body mode with `application/x-www-form-urlencoded`; the smoke test checks that the received bytes match. It removes the temporary container and volume afterward. This does not establish all OAS serialization styles, authentication schemes, inbound request validation, or another n8n instance's behavior.

## Development

```sh
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
```

The project uses TypeScript with strict checking, ESLint, Prettier, and Node.js's built-in test runner. `npm test` builds the library and runs focused contract, policy, planner-boundary, and SDK-output checks. The workspace currently contains only `packages/core/`; there is no server, CLI, Git hook, or publishing automation.

To check extracted service OAS files without copying company documents into this public repository, keep them in a local directory and run:

```sh
OPENAPI_FLOW_REAL_OAS_DIR=/absolute/path/to/openapi-json-directory npm run test:real-oas
```

This separate integration test requires a directory containing JSON files and fails when any document cannot be validated or its operation catalogue differs from the source `paths`. It never sends the documents to n8n or an external model. The three extracted service OAS files pass document validation and exact operation-catalogue comparison without `operationId`. For the Honeypot document, a deterministic model stub also drives operation selection and input extraction through `generateWorkflow` to an SDK-validated HTTP Request workflow. This checks the generation path with real OAS metadata, not model-selection accuracy, service execution, or support for every operation. `npm test` remains portable and uses synthetic fixtures because the service OAS files are not distributable with the OSS package.

To measure model selection against private OAS documents, keep a JSON dataset outside this repository. Each suite needs a unique `id`, one `specFile` or HTTPS `specUrl`, and cases with an `id`, `scenario`, and gold `expectedOperationRef`. First validate that every gold reference exists in its OAS; then supply a LangChain-compatible model endpoint and run the selection-only evaluation:

```sh
OPENAPI_FLOW_EVAL_CASES=/absolute/path/to/private-cases.json npm run eval:selection --workspace @openapi-flow/core -- --validate-only
OPENAPI_FLOW_EVAL_CASES=/absolute/path/to/private-cases.json \
  LLM_BASE_URL=https://example.com/openai \
  LLM_API_KEY=... MODEL_NAME=... npm run eval:selection
```

Set `LLM_MODEL_HEADER_NAME` if the endpoint requires the model name in a request header. The evaluator reads an OAS file or fetches an OAS URL, checks the gold references, and sends each scenario plus the operation catalogue to the supplied model. It reports exact-match accuracy and per-case latency. It never calls the service operations, creates a workflow, or contacts n8n. Keep credentials, company OAS documents, and private evaluation cases out of this public repository.

On 2026-09-24, workflows generated by an earlier build of this library were imported into an isolated local n8n 2.37.10 instance. GET and POST calls succeeded; mismatched body and status assertions failed as intended; a POST → GET sequence using a response-field binding succeeded. This manual smoke check is not part of `npm test`. The current library no longer generates status assertions.

On 2026-09-28, full natural-language generation was also checked with the configured Chomsky model and private service OAS documents. In the existing 21-case Honeypot/ICL selection dataset, generated operations matched all 21 gold references: 16 cases produced three-node SDK-validated workflows and five returned `needs_input` for missing scenario values, with no generation errors. One ICL GET case was rerun with a synthetic `gdNo` stated in the scenario and produced a three-node workflow with an HTTP Bearer credential reference. This measures operation selection and generation status, **not** expected-status or input-value accuracy: the dataset has no gold labels for those fields. These were generation checks only; no service operation or n8n instance was called, and the ICL credential reference was a placeholder.

A separate isolated n8n 2.37.10 CLI run used an earlier build and the private Honeypot OAS but sent the request only to a local synthetic HTTP responder. A declared HTTP `400` response reached and passed the generated assertion node when the plan expected `400`; the same response reached that node and failed when the plan expected `200`. This checked n8n's [Never Error response option](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) together with the former status assertion, not the actual Honeypot service. Temporary Docker volumes were removed after the runs.

An additional model run with an earlier build initially chose `200` even when the scenario explicitly expected HTTP `400`. After a then-current status-planning change, rerunning the same private OAS scenario selected `400` and generated the workflow. This historical check does not apply to the current library, which no longer selects or asserts response status.

On 2026-09-28, a workflow compiled from a private Honeypot OAS GET operation was imported and executed in isolated n8n 2.37.10 against a synthetic HTTP responder. The HTTP Request and response assertion nodes completed successfully. No Honeypot service was called. A private ICL OAS with global HTTP Bearer security also produced structurally valid workflows when given a placeholder credential reference; this did not verify credential existence, authenticated execution, or service behavior.

The Bearer path was then exercised in isolated n8n 2.37.10 with a temporary credential and an HTTP responder that accepted only the expected Authorization header. Both a synthetic OAS workflow and a workflow compiled from one ICL OAS GET operation with a required query parameter completed, including response assertions. The ICL-derived workflow used a synthetic identifier and contacted only the isolated responder. This verifies n8n credential resolution and header application in that isolated setup; it does not verify a credential or execution against the actual ICL service or the target n8n instance. The temporary credential store and Docker network were removed afterward.

The ICL-derived workflow code also passed `validate_workflow` on a target n8n MCP instance after consulting that instance's SDK reference and node definitions. This was validation only: no workflow was created or executed there, and target credential access and authenticated ICL calls remain unverified.
