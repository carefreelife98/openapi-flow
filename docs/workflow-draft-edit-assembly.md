# Scoped draft edit assembly (unreleased)

`prepareWorkflowDraftEdit` and `assembleWorkflowDraftEdit` turn a validated
[semantic edit plan](./workflow-draft-edit-analysis.md) and explicit stage results
into a checked candidate. These source APIs are not in npm 0.2.0. They do not
invoke a model, own a LangGraph session, execute APIs or deploy workflows.

## Host-owned stage results, code-owned identities

Requirement replacements carry an explicit `answerMessageId`. Use
`createWorkflowDraftEditCandidateContext` for the returned candidate's provenance
context; original plan validation and model evidence remain frozen. Canonical
`requirementHistory` preserves old snapshots rather than merging old IDs into the
current requirement. Semantic `remove-requirement` is a deterministic withdrawal,
not node removal. See [history and typed answers](workflow-draft-requirement-history.md).

The host attaches `stepId`/resolution `kind` from the validated plan. A model
should return only the values or references its own typed planning stage needs,
not regenerate these constants. `WorkflowDraftEditResolution` is the host-to-core
assembly contract, not an unconstrained JSON schema to pass to an LLM.

New API/native IDs and operation/capability identities come from the plan. A new
or replaced API result supplies explicit `values`, `bindings` and body format
when required; missing fields fail. An existing API input edit supplies set/remove
operations at exact request pointers. Binding edits change named target pointers
without replacing other bindings. Native literal edits patch parameters while
preserving unpatched settings. A whole runtime parameter declaration is an
explicit `native-runtime` result, not an invented empty actual value.

```ts
import {
  prepareWorkflowDraftEdit,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';

// The host has a current draft/context, requestMessageIds and validated plan.
// This example's selected OAS declares an integer at /body/config/count.
const step = plan.steps.find(
  (step) => step.decision.kind === 'revise-api-inputs',
);
if (!step) throw new Error('Expected an explicit input-edit decision');
const resolutions = [
  {
    stepId: step.id,
    kind: 'api-inputs' as const,
    edits: [{ kind: 'set' as const, pointer: '/body/config/count', value: 4 }],
  },
];

const prepared = prepareWorkflowDraftEdit({
  draft,
  context,
  requestMessageIds,
  plan,
  resolutions,
});
// prepared.kind === 'unvalidated-edit-materials'.
// Inspect pendingRepairs; it is not a canonical draft or executable result.

const result = assembleWorkflowDraftEdit({
  draft,
  context,
  requestMessageIds,
  plan,
  resolutions,
});
// A changed result has one checked next revision, changeSet and actual impact.
// The host chooses whether to review/adopt it; the input draft is unchanged.
```

Values such as `4` must be actual explicit user/host inputs. They are not defaults.
Unpatched paths and other instances remain intact. Changing an entire object
requires an explicit set of that object; the library does not infer a replacement
from omitted fields. Arrays retain their actual container identity: set replaces
an existing index or appends at exactly length; remove deletes an existing index
and shifts later indices. Sparse filling and absent removals fail. Pointer escaping
uses the existing RFC 6901 helper; dotted/numeric object keys remain object keys.

For a newly assigned API field, any required parent container is derived from
the OAS, not a numeric-name guess. An ambiguous container requires explicit data.
Native edits require explicit parent containers. Neither path invents actual
required values. Removing a required literal can produce an existing typed input
slot. The original request must still pass complete validation before execution.

When body format is explicitly changed, new assignments use that selected OAS
contract. Old-format data remains until explicitly removed. No other media type
is tried, value is coerced or schema assertion is discarded.

## Declared consumer repairs

Preparing does not silently fix references or edges. It derives pending work from
the original API bindings and capability-owned native reference declarations:

- A removed producer or replaced API operation asks its existing direct consumers
  to explicitly replan or acknowledge their mappings/settings.
- A changed native JSON output contract does the same. A value-only edit does not
  force binding replanning; a port-only change needs wiring work, not a new data
  binding decision when its JSON output contract is unchanged.
- API repair tasks list the original affected target pointers. A repair cannot
  alter unrelated targets or literals. Native repair edits preserve unpatched
  parameters, but their semantic correctness still needs review/evaluation.
- A native repair that changes its own output contract can create another consumer
  task. `prepareWorkflowDraftEdit` recomputes from original sources plus explicitly
  supplied results, including across rounds. Task IDs bind the actual source
  contract; unknown, duplicate or stale receipts fail.

Pass completed `repairs` with code-owned task IDs back to prepare/assemble. An empty
API repair list is an explicit acknowledgement, not a validation bypass. Missing
or incompatible sources still fail the final graph/OAS checks. An omitted optional
repair list means no completed repairs; required work remains pending.

Connections are explicit `add-edge`/`remove-edge` changes, annotated by the host
with plan step IDs that actually own connection planning. Omitting connections
preserves the old ones, including invalid dangling ones that final validation
will reject. Value-only edits cannot authorize rewiring. Metadata establishes
which stage owns an edit, not proof of natural-language intent.

Material-dependent native implementations must describe the actual contracts in
the supplied context. Full host support for refreshing specialized registries
across operation additions/replacements is not proven by these regressions and
remains an integration gate. Metadata callbacks are trusted deterministic
implementations, not untrusted executable code validated by this library.

## Canonical candidate and review

Assembly re-derives materials from the original plan and supplied results; it does
not accept a client-edited prepared draft as authority. It invokes the existing
atomic change-set boundary, including complete contract/port/reference/DAG checks
and structural impact/approval invalidation. Errors leave the original untouched.
`WorkflowDraftEditAssemblyError.failure` exposes pending dependency tasks or the
failed final change set and preserves its original cause.

Scoped `needs-clarification` decisions become code-identified pending requirements
with actual source message IDs. Independent edits can remain valid designs while
that scope is blocked. This does not automatically answer a question or approve
the result. A `no-change` result keeps the original revision and does not create
a fake successful empty transaction.

## Verification and remaining integration

Unit tests cover nested preservation, actual types, additions, removals, scoped
uncertainty, native ownership changes, cascading repairs, media changes and
atomic failure. Private OAS and independently installed tarballs exercise the
same public APIs, including deferral of a real required ICL parameter.

`npm run test:draft-edit-local-n8n` imports SDK JSON into isolated n8n 2.37.10 and
calls only a synthetic local contract server. It tests the original three API
instances, the edited five-instance DAG plus Merge, missing-input preflight,
invalid source-response rejection and an explicit JSON-to-form edit. Five API
instances use two distinct operations; this is not a five-distinct-API benchmark.
The runner supplies explicit stage results and makes no LLM call.

Finish build-based commands such as `npm test` before starting read-only runtime
or tarball checks. The clean build deletes/recreates `dist`; running it beside a
reader can produce `ENOENT` or an inconsistent package snapshot. These errors
must be fixed in verification scheduling, not hidden by runtime file fallbacks.

Model adapters for scoped edit values/references, complete material-dependent
registry refresh, optional evidence across all stages, the official conversational
LangGraph review/resume flow and real-model quality evaluation remain open.
The latest Chomsky token lookup failed with DNS `ENOTFOUND`; no live-model success
is claimed. The pre-existing special `__proto__` regression is also unresolved.
