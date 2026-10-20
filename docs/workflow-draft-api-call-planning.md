# Planning a selected API addition or replacement

These are unreleased source APIs, not features in npm 0.2.0. They complete the
request-planning part of an already selected `add-api-call` or
`replace-api-operation` step. They do not select another operation, regenerate an
existing workflow, adopt a candidate or impose a LangGraph host.

## Ownership and stages

`describeWorkflowDraftApiCallPlanning` resolves the selected full operation key
(document, snapshot and operation reference) against the original OAS. Code owns
the new instance ID; a replacement retains the existing instance ID. Repeated
instances of one operation remain distinct roles, and colliding operation
references in different documents are not treated as the same API.

The description exposes the selected request contract and actual selected response
sources. `stageWorkflowDraftEdit().apiResponseSources` separates response declarations
from request preparation. Every selected API already has its original OAS response
contract, even when its request values are still pending or it appears later in the
planning list. An unresolved replacement exposes the NEW selected response, never
its previous output. `preparation` distinguishes `request-pending` (step, role and
instruction, no request object) from `request-planned` (actual request data).

This is not execution readiness. Requirement-blocked and self sources are excluded.
Unrepaired native outputs remain unavailable; their contracts are derived only
from actual configuration and selected source contracts. API-induced consumer
repairs are discovered from the new response declaration before request generation.
Previous call settings are context, not defaults to copy when field names match.

Request media selection precedes this boundary. A body with one OAS-declared media
type has only that choice. Multiple types require an explicit `requestMediaType`;
the caller can use the existing media-selection primitive and documented policy.
No new media type or missing request value is invented here.

The composable stages are:

1. `planWorkflowDraftApiCallBindings`: one semantic mapping/question call for the
   selected target. The model selects only exact request/source pointers and actual
   source IDs. Code attaches binding kind and canonical message/contract evidence.
2. `generateWorkflowDraftApiCallArguments`: one OAS-typed literal extraction call
   only if literal fields remain. Binding-owned and explicitly confirmed fields
   are excluded from the actual output schema, including nested locations.
3. Explicit connection planning and atomic assembly: actual ports, ancestry,
   unchanged sibling content, full DAG constraints and approval impact are checked.
   Existing consumer repairs must be resolved before final connection planning.

No stage generates operation selection, instance IDs, ports, revisions, schemas,
workflow JSON, response expectations or credential values. Core and the SDK retain
those responsibilities. Data types and meanings are not coerced or transformed.

```ts
import {
  planWorkflowDraftApiCallBindings,
  generateWorkflowDraftApiCallArguments,
  planWorkflowDraftConnectionEdit,
} from '@openapi-flow/langchain';

const bindingPlan = await planWorkflowDraftApiCallBindings({
  ...edit,
  stepId,
  requestMediaType,
  model,
});
if (bindingPlan.status === 'needs-clarification') {
  return bindingPlan.questions;
}
const argumentsResult = await generateWorkflowDraftApiCallArguments({
  ...edit,
  stepId,
  requestMediaType,
  bindingPlan,
  confirmedInputs,
  model,
  allowRuntimeInputs: false,
});
if (argumentsResult.status === 'needs-input') {
  return argumentsResult.requirements;
}
const routing = await planWorkflowDraftConnectionEdit({
  ...edit,
  resolutions: [...edit.resolutions, argumentsResult.resolution],
  model,
});
return routing; // Inspect readiness, repair dependencies and review before adoption.
```

## Questions, runtime inputs and zero model calls

Binding questions now have a [typed selected-input contract](workflow-draft-api-binding-questions.md).
The model selects current input pointers and optional validated source alternatives;
core generates question wording, original operation/schema metadata and UI identities.
Free-form `message` decisions are no longer accepted by this unreleased boundary.
Explicit `answers` resolve the original proposal without another binding model call,
and remain part of the revalidated ready receipt. Partial answers expose no runnable
partial call. These checks bound question ownership, not whether a question is
semantically necessary.

An unresolved producer/mapping returns a question and no applicable request
resolution. Missing literal values return original-OAS `ApiInputRequirement`s;
code computes their identities, types and locations. A caller may opt into
`allowRuntimeInputs: true` to retain missing values as typed runtime slots. No
placeholder value is inserted into the API request. The n8n template supplies
central editable inputs, inventory, guide and fail-fast validation separately.
This option cannot resolve an ambiguous producer or structural decision.

The model selects only current message/source IDs for optional explanations; code
attaches their original text and OAS/native identities. It does not rewrite user
quotations. Explanation membership is validated, not semantic entailment.

When the OAS declares no request fields, mappings are fixed empty and no binding
model is called. When bindings and confirmed inputs own all literal fields, code
produces the empty literal object and makes no argument model call. Open optional
literal fields still count as choices; they are not silently dropped.

When request fields exist but no value-producing source exists, the model may
confirm independent input or ask for a missing producer. Its schema has **no
`mappings` field**: code already knows there can be no mapping. The canonical result
still has `bindings: []`. This is a contract-derived fact, not a default for a
missing model field. When sources exist, the output schema requires mappings.

The ready binding receipt is re-derived from its original proposal and current
contracts before argument generation. Edited receipts, stale fingerprints,
changed confirmed values, wrong steps and already supplied resolutions fail.
Transport failures remain original errors; typed planning errors retain raw model
output and cause. There is no automatic model retry, proposal repair or rebase.

## Model transport and retained provider failures

The binding choice uses strict JSON Schema output: its finite structural fields
are required in each branch. Literal extraction intentionally allows omission of
unknown OAS values. It therefore uses the same primary function-calling transport
as `generateApiArguments`, with `strict: false`, then validates the returned value
against the original Zod contract and full OAS. This is not a runtime fallback to a
different transport after rejection. No OAS field is made nullable/required and no
sentinel is substituted to satisfy a provider-only schema rule.

An actual no-source run initially returned HTTP 400 for the `not` representation
of `z.never()` in a known-empty mappings array. Removing that unnecessary generated
field fixed the binding stage. The next actual run exposed another HTTP 400:
strict JSON Schema required every optional literal property. Correcting the
literal stage's primary transport resolved that contract/configuration mismatch;
wire and runtime verification results are recorded in the implementation ledger.
The original failed executions and bounded provider messages remain under
`.local-artifacts/api-call-planning/`; no rejected request was relabeled as a pass.

## Deterministic usage and verification

Core provides `createWorkflowDraftApiCallBindingsSchema`,
`resolveWorkflowDraftApiCallBindings`, `describeWorkflowDraftApiCallArguments`,
`createWorkflowDraftApiCallArgumentsSchema` and
`resolveWorkflowDraftApiCallArguments` for hosts that supply their own structured
decisions or model invocation. All use the same original-OAS and freshness checks.
`createApiArgumentGenerationContract.valuesSchema` exposes the actual Zod value
schema directly; callers do not inspect a generic Zod wrapper's implementation.

`npm run test:api-call-planning-local-n8n` verifies addition and replacement with
explicit public structured decisions, SDK compilation/import and isolated n8n
execution. The exported test runner also accepts a literal-only root scenario.
Artifacts, exact proposals and import JSON live under
`.local-artifacts/api-call-planning/`. Unit/wire tests cover strict JSON types,
source ownership, no-source schemas, repeated roles, multiple OAS keys, questions,
runtime opt-in, stale state and preservation. See the
[implementation ledger](conversational-oss-implementation.md) for actual provider
results, retained first failures and remaining full-goal gates.

`npm run test:api-response-sources-local-n8n` additionally creates five new APIs
from two OAS documents, with IF, four independent branches, Merge and Pass-through.
Its deterministic model fixture deliberately selects the producer last and the
native IF first. The host still plans exact response bindings without dummy source
requests or extra literal-generation calls for wholly bound consumers. Isolated
n8n checks both the enabled and disabled route; these tests do not infer wall-clock
parallel execution from DAG independence.
