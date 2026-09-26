# openapi-flow

An importable Node.js library that selects an OpenAPI operation from a natural-language scenario, checks the selected operation against the supplied contract, and builds an n8n workflow with the official workflow SDK. It does not run an HTTP server, execute the workflow, or publish it to n8n.

The importable package is published as [`@openapi-flow/core`](https://www.npmjs.com/package/@openapi-flow/core). Its own code is MIT-licensed. The n8n SDK is a separate dependency under [n8n's Sustainable Use License](https://docs.n8n.io/n8n-community-license/); the MIT license does not change that dependency's terms.

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
  scenario: 'Read item 42 and verify it is available',
  model,
  baseUrl: 'https://api.example.com',
  profile: 'read-only',
});

if (result.status === 'complete') {
  // Review result.plan, result.evidence, and result.workflow before import.
  console.log(result.workflow);
} else {
  console.log(result.status, result.missingInputs, result.evidence);
}
```

The model first chooses an OAS `operationRef` (a JSON Pointer to a path operation) using the operation's method, path, summary, description, and tags, then proposes literal input bindings and body assertions in a second structured response. The host-supplied model receives these operation metadata fields for every operation, so the host must approve that data flow before using `generateWorkflow` with a remote provider. `operationId` is optional metadata, not required input. Every proposed field and value is validated against the selected OAS operation. It cannot choose a URL or author n8n node code. Credential binding is not supported: known secret-like field names are rejected, but the host must still keep secrets out of scenarios and literal inputs. `baseUrl` is a required trusted deployment origin supplied by the host application; the library does not use OAS `servers`. To skip the model or supply missing inputs explicitly, call `await compileWorkflow({ spec, baseUrl, profile, plan })` with a version-`1` plan:

```ts
const plan = {
  version: '1',
  goal: 'Read item 42',
  operationRef: '#/paths/~1items~1{id}/get',
  inputs: { 'path.id': '42' },
  expectedBody: { available: true },
};
```

The OAS operation must explicitly declare `x-openapi-flow-effect: read` or `write`. An absent effect is `unknown` and returns `blocked`; `read-only` blocks writes, while `test` permits explicitly marked writes. `test` does **not** execute the workflow. Missing required inputs return `needs_input` with no workflow. Invalid or unsupported contract data throws a source-specific error.

For an explicitly planned linear workflow, `compileSequence` can bind a prior response field to a later path or query parameter:

```ts
import { compileSequence } from '@openapi-flow/core';

const result = await compileSequence({
  spec: openApiJson,
  baseUrl: 'https://api.example.com',
  profile: 'test',
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
- `operationsFromSpec(spec)` resolves references and lists path operations, including operations without `operationId`; each candidate has a canonical `operationRef`. This API currently takes one in-memory document, so callers must bundle external references before passing it. An unbundled external reference makes operation listing fail even though `validateOpenApi` accepts the entry document's OAS structure. The library does not fetch remote URLs automatically.
- Workflow generation remains narrower than document acceptance: selected operations currently require unauthenticated requests, primitive path/query parameters, a simple JSON object body when present, and exactly one declared 2xx response. Unsupported selected-operation features fail explicitly; unrelated valid OAS operations do not make the document invalid. The SDK emits a Manual Trigger → HTTP Request → Code assertion workflow.
- Response status assertion and optional top-level primitive JSON body assertions. Linear plans support 1–5 steps and prior-response bindings for path/query parameters.

Natural-language generation currently handles **one operation per workflow**. `operationsFromSpec`, `compileWorkflow`, and `compileSequence` are asynchronous because reference resolution is asynchronous. It does not yet support AI-planned multi-step workflows, wait/branch steps, YAML input, auth/credential binding, nested schemas, multiple success statuses, instance-level n8n MCP validation, remote draft creation, or execution. These are not silently approximated. OAS effect annotations and the trusted `baseUrl` are supplied by the host, so review is still required before importing or running a workflow against a production API.

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

On 2026-09-24, workflows generated by this library were imported into an isolated local n8n 2.37.10 instance. GET and POST calls succeeded; mismatched body and status assertions failed as intended; a POST → GET sequence using a response-field binding succeeded. This manual smoke check is not part of `npm test`. A real LangChain/Chomsky two-call planning run and target-instance MCP validation remain unverified.
