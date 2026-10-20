# Scoped API binding edits

These APIs are unreleased source additions, not features published in npm 0.2.0.
They implement one existing API instance's reference-edit step or an actual
code-derived API consumer repair. They do not generate new operations, literal
values, native settings, connection edits or a replacement workflow.

## Host-controlled staging

`stageWorkflowDraftEdit` re-derives completed results from the original validated
edit plan and explicit `resolutions`/`repairs`. It returns `kind: 'unvalidated-edit-stage'`,
named pending resolution steps, pending consumer repairs,
scoped pending requirements, primary-readiness IDs and `apiResponseSources`. It never fabricates
revision/approval metadata or fills absent results with empty successful values.
The original draft remains unchanged.

An unresolved operation replacement or native-parameter change does not expose its
old output contract as an available source. The same applies to sources directly
blocked by unresolved requirement scopes. A known API response contract can still
be described while its input values are being planned; model context explicitly
marks pending source changes, not old values as newly confirmed inputs. This is
contract availability, not whole-workflow readiness. Every selected original API
response is now available before its request values. An unresolved replacement
offers only the new selected OAS contract. `preparation` explicitly distinguishes
`request-pending` (no request object) from actual `request-planned` data. Self and
requirement-blocked sources remain excluded; native outputs awaiting explicit
consumer repair are still unavailable.

Complete `prepareWorkflowDraftEdit` and `assembleWorkflowDraftEdit` still require
all actual primary results and never accept this staged view as canonical authority.
Do not pass staged content off as an approved draft or executable workflow.

## One bounded model call or structured core input

```ts
import { assembleWorkflowDraftEdit } from '@openapi-flow/core';
import { planWorkflowDraftApiBindingEdit } from '@openapi-flow/langchain';

const result = await planWorkflowDraftApiBindingEdit({
  draft,
  context,
  plan,
  requestMessageIds,
  resolutions, // explicit completed results; [] when none exist
  scope: { kind: 'step', stepId }, // a pending revise-api-bindings step
  model,
});
if (result.status === 'ready' && result.kind === 'step') {
  const candidate = assembleWorkflowDraftEdit({
    draft,
    context,
    plan,
    requestMessageIds,
    resolutions: [...resolutions, result.resolution],
    connections, // separately planned explicit edits, if required
  });
  // The host reviews/adopts candidate. It must supply any other pending results.
}
```

For a repair, obtain the actual `api-bindings` task from `stageWorkflowDraftEdit`
and pass `scope: { kind: 'repair', taskId: task.id }`. A successful result contains
`repair`, not an invented primary step resolution. Append it to explicit repairs
for staging/atomic assembly. Repaired native output contracts may derive further
tasks; this function does not automatically run the loop or adopt the result.

Without a model, call `describeWorkflowDraftApiBindingEdit` and then
`resolveWorkflowDraftApiBindingEdit` with its fingerprint and an explicit
`proposal`. The resolver re-derives current staged authority rather than trusting
client-edited descriptions. Unknown/stale tasks, changed receipts or source state
and completed primary steps cannot be silently replanned or rebased.

The model receives the selected input contract/metadata, current literals and
bindings, available API/native output contracts and API response-pointer catalogs.
Prepared API source instances include their actual inputs and bindings under
`preparation.request`; selected pending instances include their instruction instead. Scoped
requirements and background messages help distinguish repeated API roles.
Background messages are not authorization to repeat old requests. Only actual
current-request IDs are available in decision evidence. No inference uses array
order, matching property names or a guessed HTTP response envelope.

## Semantic choices and code-owned patches

| Model decision                 | Deterministic result                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `bind`                         | Set/change the requested mapping; reject a conflicting literal                                                     |
| `replace-literal-with-binding` | Require the actual literal and explicitly remove only that exact target before binding; unavailable in repair mode |
| `unbind`                       | Remove an existing mapping, without inventing a new literal                                                        |
| `keep`                         | Repair-only acknowledgment of an existing mapping; revalidate it against the changed contract                      |
| `needs-clarification`          | Return a concrete scoped question with a code-derived ID, without a partial resolution or repair                   |

The output schema contains only these necessary choices, target/source pointers,
exact current-message provenance and optional user-facing explanations. Source
IDs are constrained to actual available instances. Repair pointers are constrained
to actual affected targets, each of which must be decided exactly once. With zero
sources, binding alternatives are absent instead of emitting an empty enum.
Code supplies `kind: 'node-output'`, step/task/question identities and actual patches;
it never asks the model to reconstruct old literal values or complete binding lists.

Literal removal is an explicit semantic choice with visible `valueEdits`, not an
automatic conflict cleanup. Unbinding a required field leaves an actual OAS input
slot for execution. It does not insert a placeholder, coerce data or assume another
field contains the value. Source pointers must identify declared API body or native
output values; dynamic schema-permitted paths remain available. No transformation,
aggregation, filtering or semantic/type conversion occurs inside a binding.

Unrelated values and mappings are preserved. Unknown paths, overlapping decisions,
self/unknown sources, literal ownership conflicts and incompatible declared types
fail without correction or retries. Optional explanations are omitted from the
wire schema when disabled and require actual current-message evidence when enabled.
Evidence existence does not prove that the model interpreted the requested role
correctly; ambiguous roles must remain questions and require host review.

## Validation and adoption boundary

The shared `validateApiBindingAssignment` boundary validates one actual assignment
using the same declaration/type checks as `validateApiBindingAssignments`. It does
not invent empty bindings for unrelated calls to make the complete validator pass.
The full validator retains all-material coverage, overlaps and API binding cycle
checks. Single-assignment checking is not proof of all OAS alternatives, actual
runtime field presence, graph ancestry, native dependency routes or complete DAG
validity. Full source/request checks and execution-time guards remain in place.

After parsing, the edit resolver validates the selected API's actual resulting
arguments and every retained/changed binding. A question result does not conceal an
invalid proposed assignment or authorize partial adoption. It does not by itself
create a persisted clarification round; question storage, answers, suggestions and
review/resume policy remain host responsibilities.

Connection changes are separate. A valid source mapping can still fail atomic
assembly when the actual producer is not an ancestor, a cycle is introduced or
another pending repair is unresolved. The library does not delete dangling edges,
rewire nodes or weaken these checks automatically. Only final atomic assembly
returns a new candidate revision with full impact and approval invalidation.

Local HTTP regressions inspect actual ChatOpenAI requests in primary/repair/empty
source contexts and both explanation modes. Model responses are scripted; these
checks are not live-model selection-quality evidence. The isolated n8n runner
additionally checks actual downstream URLs after changing a producer and after
replacing an operation/response pointer. See the [implementation ledger](conversational-oss-implementation.md).

Scoped native parameter/connection planners and a canonical conversation reference
now compose these boundaries. Initial clarification composition, specialized late
registry prerequisites, suggestions and complete requirement/question lifecycle
remain open. Staging plus this bounded resolver is not full OSS completion.
