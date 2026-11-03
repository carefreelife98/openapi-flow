# Desired connection regions

Introduced in 0.7.0. This document describes the new model contract and the
migration from the 0.6.x add/remove wire.

The incremental connection and connection-revision model contracts now use
`set-region`. The model selects the complete desired incoming relations and
boundaries of an explicit set of target nodes. Core calculates the delta against
the current accepted graph. Unselected target nodes retain their incoming edges,
roots and terminal decisions by the contract's write scope.

```json
{
  "kind": "set-region",
  "nodes": [
    {
      "nodeId": "consumer",
      "incoming": [{ "source": { "nodeId": "producer" } }],
      "root": false,
      "finish": true
    }
  ],
  "factIds": ["original-requirement"],
  "reason": "Continue the selected producer into this consumer."
}
```

Each incoming relation targets its containing node, so there is no second target ID
to disagree with ownership. Fixed single ports are copied from the original node
contract. Multiple input/output ports require an explicit selection. Single-output
nodes select a finish boolean; multi-output nodes select `finishOutputs`. Existing
desired connections are retained; they are not submitted as repeated additions. Core does not deduplicate malformed
model output: duplicate owned nodes, duplicate desired connections, duplicate
roots/terminals, missing required fields, unknown IDs/ports, out-of-scope targets
and omitted protected edges fail explicitly.

Core owns `WorkflowConnectionRegion`, its runtime schemas,
`createWorkflowConnectionRegionPatch` and `deriveWorkflowConnectionRegionPatch`.
The former validates the actual session and expected revision. The latter creates
an unadopted proposal from a supplied description, including the explicit
before/after descriptions used by material revisions. Neither adopts a graph.
Application and revision APIs retain their atomic graph, source, protected-edge,
scope, route-availability and revision checks. The resulting Core planning
decision remains a `patch`; model adapters alone change their wire contract.

Material revision keeps removed nodes as explicit retired-node choices. Selecting
such a node requires empty incoming connections, no root and no terminals; Core
calculates their removal. Retained consumers must explicitly drop or replace
incoming relations from removed producers. A changed source never silently erases
an old graph boundary.

The old model-generated add/remove wire is rejected. There is no dual parser,
version fallback, coercion, output repair or package override. Scripted model
consumers must produce the new region shape. Direct Core patch callers still use
the existing explicit patch API.

## Necessary connection candidates

`describeWorkflowConnectionCandidates` groups sources that share the same allowed
target-port choices. Schema and model context use these same code-derived groups. Node-local endpoint
schemas share standard local JSON references instead of serializing the same
source catalog for every target; the 170-instance scaling regression checks this.

Pruning uses explicit independence, required data/dependency order and typed
precedence/route/join goals. A source cannot connect backward across the transitive
closure of necessary ordering. A source cannot precede another member of its independent group.
For a normal input, a source independent of a required response producer cannot
make that producer available on its route. An all-input join may combine those
routes, while input-port-scoped reads still constrain their own ports. Without an
explicit independence constraint, this check leaves possible future control
ordering available instead of assuming absent references prove impossibility.

These are necessary conditions, not a complete planner. Individually available
connections can conflict when selected together. Atomic validation remains
mandatory. Existing connections can be retained without requiring the model to
reconstruct their delta. Revision goal proposals are not constrained by obsolete
before-goals: the resulting new goals and graph are validated together.

## Partial plans and errors

An open boundary or an unbuilt join remains unfinished work. A path between
explicitly independent nodes is a structural contradiction and is rejected before
adoption, including indirect paths through intermediate nodes. Restored accepted
history is checked against the same invariant; invalid old checkpoints are not
silently migrated. Semantic goal correctness remains model-owned.

Root failures retain their error code and attach structured evidence: the node,
actual incoming edges and the failed preconditions. Independence failures name
the goal and the conflicting endpoints. The errors describe the current candidate
state, not a permanent prohibition on a node.

## Rejection feedback

Hosts retain their entire private rejection ledger and count every rejection
against the original finite resource policy. The example host and Qoopilot send
only the latest rejection matching the current session, source fingerprint and
revision to the next step call. After an accepted revision, old errors disappear
from the model input but remain in diagnostics and accounting.

`planWorkflowConnectionStep` rejects feedback from older or future revisions at
its input boundary, before invoking a model. Historical human/goal reviews and
material repair receipts keep their distinct existing ownership contracts; this
change does not reinterpret them as connection-step feedback.

The relative quality of latest-current feedback versus no feedback needs a
controlled live-model evaluation. Removing historical context is not itself proof
that all model planning failures are resolved.

## Host scheduling

Pending nodes are not necessarily ready planning work. The example scheduling
policy and Qoopilot rank pending inputs whose necessary data, existing incoming
and typed precedence/route/join producers are already placed ahead of bundles
that can only wait. Local bundles precede whole-session work at the same rank;
otherwise existing outline order is retained. An incomplete comparison can remain
pending without starving its producer bundles. This policy chooses planning work,
not workflow execution order, and creates no connections or business decisions.
