# Draft edit analysis (unreleased)

This is the semantic edit-analysis boundary, not a complete conversational edit
pipeline. The additions below are not in npm 0.2.0. The deterministic
[assembly boundary](./workflow-draft-edit-assembly.md) is now available; completing
the model-result stages, official LangGraph review/resume flow and live-model evaluation is
still required by the [implementation ledger](./conversational-oss-implementation.md).

## Composable entry points

`analyzeWorkflowDraftEdit({ draft, context, requestMessageIds, model, options? })`
performs one structured-output call. The host must put the new user request in
`context.messages` and explicitly identify its message IDs. Existing accepted
messages remain useful context, but they cannot substitute for provenance of a
new edit. OAS operations and native capabilities are the actual supplied contracts.
An empty operation list offers no API addition; no hidden HTTP endpoint is added.

```ts
import { analyzeWorkflowDraftEdit } from '@openapi-flow/langchain';
import {
  createWorkflowDraftEditPlan,
  validateWorkflowDraftEditPlan,
} from '@openapi-flow/core';

// draft and context come from the current host-owned session.
// context.messages must contain the actual edit-request message 'edit-2'.
const plan = await analyzeWorkflowDraftEdit({
  draft,
  context,
  requestMessageIds: ['edit-2'],
  model,
  options: { includeExplanations: true },
});
validateWorkflowDraftEditPlan({
  draft, context, requestMessageIds: ['edit-2'], plan,
});

// For an already structured edit, use createWorkflowDraftEditPlan directly.
// This requires an explicit typed proposal, not another model invocation.
```

The model selects an edit kind, supplied operation candidate or existing target,
a short instruction and exact current-request quotations. Optional explanations
include checkable sources. The output has no revision, approval, readiness, input
value, settings object, bindings, edges, schemas, deployment credentials or n8n
JSON. Turning explanations off removes the field from the output schema, but
does not disable provenance checks. Source-existence checks do not prove that
the model interpreted the request correctly.

## Code-owned plan and stage separation

Core attaches the original OAS operation key and snapshot, allocates new instance
IDs, fingerprints the draft/context/request and assigns direct stage ownership.
Two additions of the same operation or native capability can have distinct roles
and identities. Repeating an identical decision is rejected, not silently removed.
Decision/step array order is not the execution order of the final n8n DAG.

| Decision | Direct planning responsibility |
| --- | --- |
| Add API call / replace operation | Resolve contract, bindings, arguments, connections |
| Revise literal API inputs | Arguments only; no API selection call |
| Revise API bindings | Bindings, arguments, connections |
| Add native instance | Native parameters, connections |
| Revise native instance | Native parameters, bindings, connections |
| Remove node / revise connections | Connections |
| Revise requirement | Requirements |
| Needs clarification | Existing clarification stage |
| No change | No subsequent planning stage |

`steps[].stages` describes the direct decision boundary. It is not a complete
dependency-aware scheduler or proof of a valid resulting graph. For example,
removing a producer leaves its consumers' bindings unresolved until explicitly
replanned; the library never deletes those references automatically. The host
must still validate the complete candidate using `applyDraftChangeSet` before
replacing the canonical draft. That existing boundary checks ports, data
availability, OAS contracts and acyclic structure, computes actual structural
impact and invalidates only affected approval coverage.

`ready-for-planning` means the edit intent can enter those later stages, not that
an executable workflow is ready. `needs-clarification` retains definite independent
decisions alongside explicitly scoped uncertainty. It does not generate missing
concrete runtime values. `no-change` is exclusive of changes/uncertainty and is
not a no-op revision. Structured questions, choices, suggestions, user review,
resumption and concurrency remain the host composition's responsibility, using
the existing OSS clarification contracts where applicable.

## Validation and failure ownership

- Candidate enums and existing API/native/requirement IDs constrain actual model
  output; core checks them again after resolving candidates.
- Sources must quote the current request exactly. Explanations may additionally
  cite supplied historical messages, original OAS or registered native contracts.
- Stale/modified plans fail against their full draft/context fingerprints,
  including changed values or approvals. IDs/stages cannot be client-edited.
- If inputs change during the awaited call, the proposal fails. It is not rebased
  onto new state. Same-thread serialization still belongs to the host.
- Unknown targets, stale operations, wrong node kinds, remove/revise conflicts
  and modified derived identities fail without repair.
- `WorkflowDraftEditPlanningError.failure` retains the raw proposal and whether
  schema or canonical validation failed, with the original cause. Transport errors
  propagate without an OSS retry. Hosts own persistence, redaction and retry policy.

There is no final edit application inside `analyzeWorkflowDraftEdit`. It cannot
establish that later literal generation preserves every unaffected nested field,
or that a requested change semantically affects only the declared targets. The
deterministic assembler now preserves unpatched fields from explicit stage results
and validates the complete candidate. The remaining model-result and host stages
are not delegated to a free-form full-workflow response.

## Development checks

`test/workflow-draft-edit.test.mjs` covers direct structured analysis, repeated
roles, native-only/empty contexts, code-owned stages, stale/modified state,
source checks and failure preservation. `test/workflow-draft-edit-http.test.mjs`
uses the actual ChatOpenAI client and local HTTP transport to inspect both
explanation modes and validate the transmitted JSON Schema. It does not call a
live LLM or establish model quality.

The private OAS integration applies a separately prepared addition atomically,
preserving the original operation snapshot and old instance. The independent
tarball consumer checks public types and core edit-plan exports with actual
ICL OAS. Neither executes a business API. Live Chomsky access currently fails at
token-server DNS lookup (`ENOTFOUND`), before any model invocation.
