# Draft connection edits

These are unreleased library APIs, not features published in npm 0.2.0.
They edit connections between resolved API/native instances. They do not choose
new APIs, create native nodes, generate parameters or change bindings.

## Ownership and stages

`describeWorkflowDraftConnectionEdit` re-derives staged content from the original
draft, validated semantic plan and explicit completed results/consumer repairs.
It derives ports, references, per-input references, exclusivity and join semantics
from actual OAS calls and registered native implementations. Missing execution
values remain original typed input slots; they do not block topology design.

The description reports `not-required` when no semantic step includes connection
work. This does not certify other pending stages. It reports `waiting-for-materials`
when actual primary results, consumer repairs or scoped decisions remain pending.
This final whole-graph stage then makes **zero model calls**. Hosts can continue
independent material-planning work with existing staging APIs. The library does
not expose old replacement/native contracts as if requested changes were complete.
An empty list of resolutions is explicit input, not an invented successful result.

Resolved implicit connection work also reports `not-required` with a code-owned
`structuralProof: { kind: 'single-node-dag', nodeId }` when exactly one actual
instance remains, there are no retained edges, its only input is `main`, and it
has no join/data/dependency requirement. A one-node DAG has no non-cyclic
inter-instance edge to choose. This proof is derived after material readiness;
it does not bypass pending value-planning results, repairs or unresolved design questions. An explicit
`revise-connections` intent still takes the normal model/question path, even with
one instance. Multiple instances, retained incident edges and join ports are not
silently simplified. The fingerprint includes the real contracts and proof.

Both direct `planWorkflowDraftConnectionEdit` and the canonical LangGraph use this
same core description, so a single API does not need a model-generated
`keep-connections` or an extra routing question. Normal atomic assembly and host
candidate approval remain required. The host re-derives the candidate before
adoption; `not-required` is not an execution-readiness or approval claim.

Once actual materials are available, the connection scope is the union of real
connection-owning steps. Each added/removed edge must touch that scope. A removed
node's original neighbours are included so explicit reconnection is possible.
The batch records all owning step IDs in code; it does not claim that message
membership proves a particular edge's semantic correctness or per-step causality.

Existing edges are preserved unless explicitly removed. Removal IDs identify exact
existing editable edges, including dangling edges after a requested node removal
or obsolete native ports. New endpoints come only from actual staged port pairs.
Code does not delete these edges automatically, substitute ports, infer data
mappings, sequence independent nodes or insert a missing Merge node.

## Composable use

```ts
import { planWorkflowDraftConnectionEdit } from '@openapi-flow/langchain';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';

const result = await planWorkflowDraftConnectionEdit({
  draft,
  context,
  plan,
  requestMessageIds,
  resolutions, // actual completed primary stages
  repairs, // actual completed consumer repairs, optional
  model,
});

if (result.status === 'ready') {
  // A fully validated candidate, not an automatic host-state update.
  const template = compileN8nWorkflowTemplate({
    draft: result.candidate.draft,
    context,
    name: 'Reviewed connection edit',
    deployments,
  });
  // Host owns review/adoption/download and stores the same candidate revision.
}
// needs-clarification: display questions, adopt no partial connection changes.
// waiting-for-materials: complete named stages/repairs before this final stage.
// not-required: use normal atomic assembly for any other completed edit work.
```

Structured host input needs no model: call the core description function, then
`resolveWorkflowDraftConnectionEdit` with the description's fingerprint and an
explicit `proposal`. The resolver re-derives all authority. A modified description
is not accepted as a source of contracts; stale state fails without retry/rebase.
For background on primary results and repairs, see the
[assembly contract](workflow-draft-edit-assembly.md) and
[binding edit contract](workflow-draft-api-binding-edits.md).

## Minimal model decisions

The output schema uses actual endpoint/port pair unions, not independent node and
port enums that permit a port on the wrong node. It contains only:

- `add`: actual `source: {nodeId, port}` and `target: {nodeId, port}`.
- `remove`: the code-derived ID of an existing editable edge.
- `keep-connections`: alone, explicitly retain every connection.
- `needs-clarification`: a concrete unresolved routing question.

Every decision requires exact current-request message evidence. User-facing
explanation/evidence fields exist only when enabled in the semantic plan's
options. Background messages and requirements explain node roles but do not
authorize new changes. The model sees actual API-instance roles/values/bindings,
native condition parameters, real topology contracts and current edges, not the
entire OAS or revision/patch metadata it would have to reproduce.

Code supplies edge tuples, step/question IDs and the final atomic change set.
Duplicate/cancelling changes, existing-edge additions, undeclared ports/sources,
out-of-scope changes, self-cycles and invalid quotations fail without correction.
Questions return no partial candidate or applicable connection list. Their explicit
changes still receive local membership/ownership checks; a question result is not
proof of a complete valid DAG.

## Full validation and limits

A ready result passes the existing complete atomic assembly: OAS/binding checks,
every-route data availability, cycles, compatible exclusive branches, required
join inputs, revisions, impact analysis and affected approval invalidation. Starts
are derived from roots by code, not invented by the model. `keep-connections`
with unchanged content returns an explicit no-change candidate without a new
revision; material changes still pass normal atomic assembly with retained edges.
Zero actual changes are handled by atomic assembly itself after all required
resolutions and repairs have been checked. It preserves the original draft and
revision rather than passing an empty change set to the non-empty mutation API.
This is not a recovery path for a missing result or an invalid change.

When a topology decision remains, the model adapter makes one structured call, using the shared plain-JSON serializer
and original Zod response validation. Schema/semantic failures retain their original
output, cause and stage; upstream transport failures are not swallowed or retried.
These contracts do not establish model semantic accuracy. Host review, question
lifecycle/suggestions, dependency-aware scheduling, material-registry refresh and
the full conversational LangGraph example remain separate work.

The existing `planWorkflowConnections` API remains an additive planner with supplied
edges fixed. It is not silently repurposed as this mutable-draft edit API.
