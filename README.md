# openapi-flow

An importable Node.js library that selects an OpenAPI operation from a natural-language scenario, checks the selected operation against the supplied contract, and builds an n8n workflow with the official workflow SDK. It does not run an HTTP server, execute the workflow, or publish it to n8n.

The importable package is published as [`@openapi-flow/core`](https://www.npmjs.com/package/@openapi-flow/core). Its own code is MIT-licensed. The n8n SDK is a separate dependency under [n8n's Sustainable Use License](https://docs.n8n.io/n8n-community-license/); the MIT license does not change that dependency's terms.

The latest published package is `0.1.0`. This `main` branch contains newer, unreleased API and workflow-generation changes; the examples below describe the repository source until a new version is published.

The repository root is a private npm workspace; the importable library lives in `packages/core/`. Its public exports are declared in `packages/core/src/public-api.ts` (there is no server or `index.tsx`). Types live in `src/types/`, LangChain structured-output schemas in `src/schemas/`, OpenAPI parsing in `src/openapi/`, AI planning in `src/planning/`, n8n compilation in `src/workflow/`, and shared validation in `src/utils/` under that package.

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

The model first chooses an OAS `operationRef` (a JSON Pointer to a path operation) using the operation's method, path, summary, description, and tags. A second structured response extracts literal input bindings and only response body assertions explicitly requested in the scenario. It does not plan or assert a response status. For a normal request, the generated workflow has a Manual Trigger and an HTTP Request node, and the OAS may declare multiple possible responses. Status wording in a scenario does not add a status assertion. The host-supplied model receives the operation catalogue and selected operation metadata, so the host must approve that data flow before using `generateWorkflow` with a remote provider. `operationId` is optional metadata, not required input. Every proposed field and value is validated against the selected OAS operation. It cannot choose a URL or author n8n node code. The host must keep secrets out of scenarios and literal inputs; authenticated operations refer only to existing n8n credentials by ID and name. `baseUrl` is a required trusted HTTP(S) deployment URL supplied by the host application; an optional path prefix is preserved, and the library does not use OAS `servers`. To skip the model or supply missing inputs explicitly, call `await compileWorkflow({ spec, baseUrl, profile, effectPolicy, credentialBindings, plan })` with a version-`1` plan:

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

References must point to an earlier step and a declared response field of a compatible primitive type. The source assertion fails if the field is missing at runtime. The model does **not** generate multi-step plans yet; the host application supplies this plan.

## Document validation and workflow generation

- `validateOpenApi(spec)` checks a JSON object against Scalar's OpenAPI schema validator. It does not impose a project-specific version, byte-size, method, operation-count, or `operationId` requirement. It accepts standard external `$ref` syntax without fetching referenced documents. A missing required OAS field fails validation rather than being filled in automatically.
- `operationsFromSpec(spec)` resolves references and lists outgoing `paths` operations, including operations without `operationId`; each candidate has `source: 'paths'` and a canonical `operationRef`. OAS `webhooks` and operation `callbacks` describe incoming requests, not another kind of HTTP Request node, and remain valid in the supplied document. They are not workflow candidates yet. The source discriminator and centralized node construction keep room for a future inbound-node mapping, likely using n8n's [Webhook trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) and, when needed, [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/), without treating those operations as REST calls. Listing does not require every operation to be convertible to n8n. This API currently takes one in-memory document, so callers must bundle external references before passing it. An unbundled external reference makes operation listing fail even though `validateOpenApi` accepts the entry document's OAS structure. The library does not fetch remote URLs automatically.
- Natural-language selection and value extraction use Zod schemas. LangChain converts them to JSON Schema for `method: 'jsonSchema'`; Zod validates the model output locally, including OAS-derived candidate keys and the `valueJson` literal syntax. The compiler separately checks parsed values against the selected OAS operation and enforces host-supplied effect and credential policy. Zod cannot establish whether a value was actually stated in the scenario.
- Workflow generation remains narrower than document acceptance: selected operations currently support no authentication or one HTTP Bearer security requirement backed by an existing n8n credential, primitive path/query/header/cookie parameters using supported serialization, and either JSON or scalar-field form-urlencoded request bodies. If OAS declares multiple request media types, the plan must supply `requestMediaType` (or the host supplies it to `generateWorkflow`); without a choice the result is `needs_input`, not an invalid document. Other security schemes, combined schemes, alternative security requirements, non-scalar form fields, and other OAS parameter styles fail explicitly for the selected operation. JSON request bodies and explicitly requested top-level response assertions are checked against their OAS schemas, including arrays and nested objects. Known unsupported conversion features throw the exported `UnsupportedOperationError` with the selected `operationRef`; OAS validation failures and missing host credential bindings remain separate errors. Unrelated valid OAS operations do not make the document invalid. The SDK normally emits Manual Trigger → HTTP Request. It adds a Code assertion node only for an expected body field or for a response field needed by a later sequence step. Ordinary requests use n8n's default HTTP error handling; assertion workflows pass non-2xx responses to the assertion node for explicit body checks.
- The compiler accepts exact, ranged, and `default` OAS response entries without selecting a status. Assertions can compare top-level response fields containing nested JSON values. Linear plans have no project-specific step-count cap, and prior-response bindings are currently for primitive path/query values.

Natural-language generation currently handles **one outgoing path operation per workflow**, including operations with multiple OAS responses. `operationsFromSpec`, `compileWorkflow`, and `compileSequence` are asynchronous because reference resolution is asynchronous. It does not yet support webhook/callback trigger generation, AI-planned multi-step workflows, wait/branch steps, YAML input, other OAS authentication schemes, all OAS parameter styles and media types, instance-level n8n MCP validation, remote draft creation, or execution. Sequence response-field references currently bind only primitive path/query inputs; header/cookie values must be supplied directly. These are conversion capabilities that have not been implemented, not restrictions on whether the input OAS document is valid. The trusted `baseUrl`, effect approvals, and credential references are supplied by the host, so review is still required before importing or running a workflow against a production API.

The mapping was checked against the [published OAS 3.2.1 specification](https://spec.openapis.org/oas/v3.2.1.html) and n8n's [HTTP Request V3 node definition](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/Description.ts) and [runtime implementation](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts). The current source definition lists node version 4.3, used by this package, alongside newer versions. Upstream `master` can change; a target n8n instance must be checked separately. Local tests inspect emitted workflow parameters and OAS validation, not the actual HTTP bytes sent by a target n8n runtime. SDK validation alone does not prove the node can execute every OAS contract.

For a focused runtime check, the `n8nio/n8n:2.37.10` image's installed HTTP Request description exposed the seven standard methods used by this compiler, plus header and form-urlencoded options. Two generated workflows were imported into disposable containers and executed only against a local synthetic HTTP responder. The receiver observed a POST with the declared header and `application/x-www-form-urlencoded` body, and a GET with the path, header, and cookie values. n8n re-encoded the form space from the node's `name=a+b` setting to the transmitted `name=a%20b`; these decode to the same form value but are not byte-identical. This check does not establish all OAS serialization styles, credential schemes, or target-instance behavior.

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

This separate integration test requires a directory containing JSON files and fails when any document cannot be validated or its operation catalogue differs from the source `paths`. It never sends the documents to n8n or a model. The three extracted service OAS files now pass document validation and exact operation-catalogue comparison without `operationId`; this does not measure model-selection accuracy or mean their operations can all be compiled or executed. `npm test` remains portable and uses synthetic fixtures because the service OAS files are not distributable with the OSS package.

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
