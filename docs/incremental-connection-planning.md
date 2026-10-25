# Incremental connection planning (0.3.17)

This source adds independently callable connection-planning stages. Publication
status is tracked in the [release record](releases/0.3.17.md). A host-owned automatic
LangGraph composition lives in `examples/langgraph-workflow`, including opt-in
native material generation. Host streaming UI and broad short-query quality
evaluation remain separate work; these libraries do not ship a server or UI.

## Ownership and flow

`planWorkflowConnectionGoals` interprets confirmed requirement facts as goals.
Core validates their references and coverage and creates a
`WorkflowConnectionSession`. Goal IDs and session identity are code-owned.

`planWorkflowConnectionStep` performs one structured model invocation. It receives
all supplied node contracts, OAS operation identities/descriptions, native settings,
accepted edges, open boundaries, remaining goals and explicit rejection feedback.
It returns one decision and a code-owned `expected` receipt. It neither applies
the decision nor runs a hidden planning loop.

The decision distinguishes:

- `patch`: one atomic connection bundle, explicit roots and terminals;
- `request-completion`: ask code to inspect completion, not approve itself;
- `request-native-material`: request an instance from the supplied capability
  registry without generating an ID or raw n8n JSON;
- `require-user-decision`: a genuine unresolved business decision, not a request
  for a human to fix technical planning errors.

The host owns loop budgets, cancellation, checkpoints, native material generation,
business review and safe progress projection. The two request decisions do not
implement those host paths by themselves.

## One explicit iteration

```ts
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowConnectionSessionSource } from '@openapi-flow/core';
import {
  applyWorkflowConnectionStep,
  finalizeWorkflowConnectionSession,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
} from '@openapi-flow/langchain';

declare const source: WorkflowConnectionSessionSource;
declare const model: BaseChatModel;

const session = await planWorkflowConnectionGoals({ ...source, model });
const proposed = await planWorkflowConnectionStep({
  ...source,
  session,
  model,
});

if (
  proposed.decision.kind === 'patch' ||
  proposed.decision.kind === 'request-completion'
) {
  const result = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: proposed.expected,
    proposal: proposed.decision,
  });
  if (result.status === 'accepted' && result.inspection.ready) {
    const plan = finalizeWorkflowConnectionSession({
      ...source,
      session: result.session,
    });
    // The existing n8n compiler consumes this validated plan.
    console.log(plan.starts);
  }
}
```

This is a single iteration, not a complete host implementation. Persist an accepted
session before publishing a safe view. A rejection leaves the supplied session
unchanged. The host can pass the original rejected decision and structured
violations to a subsequent call under its explicit budget.

## Guarantees and limits

The model chooses actual endpoint identities. It chooses a port only when multiple
ports are available; code copies a unique declared port. Schemas index endpoints
separately instead of enumerating every node pair. No OAS/API-count cap is added.

`expected.sessionId`, `expected.sourceFingerprint` and `expected.revision` must all
match before applying a proposal. A response from another session cannot be
applied merely because its revision number happens to match. Original contracts,
values, bindings and native parameters remain outside a connection patch.

Unconnected nodes stay open and never become implicit roots. Closed ancestral
regions retain route/reference checks. Finalization requires all boundaries and
structural goals to close and reuses the existing full DAG validator. Serializing
required independent calls, joining mutually exclusive routes, and bypassing a
required producer do not become complete workflows.

Coverage of requirement IDs is not proof of complete natural-language meaning.
Structural goals are checked by code; semantic assessments remain explicitly
identified model claims. The host still needs quality evaluation of goal
interpretation and business-question appropriateness.

`WorkflowConnectionPlanningError` preserves original output and cause for private
diagnostics. Its JSON representation contains only the existing safe OSS
diagnostic. HTTP/model failures remain distinct from rejected connection plans;
these functions do not retry, repair output, infer credentials or relax OAS rules.

Only `WorkflowConnectionSession` is the serializable partial state. Source inputs
can contain capability callbacks and must not be stored as checkpoint data or
sent to the browser. Project a separate safe view rather than publishing raw
planning context, history, model output or original OAS documents.

## Native material extension without replacing the plan

`extendWorkflowConnectionSession` accepts an exact `expected` receipt and
`additionalNativeNodes`. It only adds native instances. It does not replace the
scenario, API contracts, values, bindings, existing native instances, goals or
accepted step history. It replays that history against the expanded contracts
before returning a new source fingerprint. Old proposals then fail the source
check even though the connection revision has not changed.

The caller supplies instances produced by the existing native planning functions,
retains the returned `previous` receipt for its private material history and
reconstructs the runtime source with those exact additions. Empty, duplicate,
unsupported, invalid or stale additions fail atomically. This is not an API for
silently rewriting a failed graph or inventing native settings.

## Host-owned automatic child graph

The private example package exports `createIncrementalWorkflowConnectionGraph`.
Create one runtime per connection run. Supply its `source` resolver, model and
explicit `policy`: `maxModelInvocations`, `maxRejectedProposals`, `deadlineMs`.
There are no environment or policy defaults. These are resource budgets, not
limits on the number of OAS documents or API instances.

The graph interprets goals, reserves each model invocation before calling,
checks and applies coherent bundles, publishes a separate progress projection,
and finalizes through the existing full validator. Graph-invalid proposals return
their original structured violations to the next invocation. HTTP/model failures
do not consume this path as hidden retries. A failed model stage records only a
failure reference in checkpoint state; its next node rethrows the original private
exception. Resuming that failure node does not call the model again.

## Rejected initial goals (0.3.17)

`createWorkflowConnectionGoalRejection({ ...source, error })` classifies a typed
initial goal output/contract failure against the unchanged source fingerprint.
It returns the exact JSON output, diagnostic stage/code and original reason.
It returns `undefined` for transport, cancellation, unrelated failures, changed
source or output that cannot be checkpointed losslessly as JSON. The host must
propagate those failures, not turn them into a model retry.

The host may checkpoint the returned `WorkflowConnectionGoalRejection` and supply
it as `rejectedProposals` to another `planWorkflowConnectionGoals` invocation.
That function still makes exactly one model call and validates each supplied
record before the call. It neither repairs the response nor changes requirements.
The example child graph implements the bounded loop and counts rejected goals
and rejected connection bundles against the same explicit rejection budget.
Invalid initial goals never enter a session or a public progress graph.

## Discovery input for clarification (0.3.17)

`describeApiOperationCandidate` projects an original `ApiOperationContract` into
the existing public `ApiOperationCandidate` discovery contract. The clarification
model receives every supplied candidate's identity, method, path, description
and tags, plus native feature descriptions. It does not receive duplicated raw
path items, request/response schemas or native configuration schemas at this
scope-discovery stage. Selected-operation planning and all contract validation
continue to use the original complete OAS. No candidate filtering or API-count
limit is introduced.

This reduces irrelevant model input, not a latency guarantee. A broad request
over 176 original candidates still hit its unchanged 60-second model timeout in
the recorded actual-model check. It is not counted as a successful workflow.

## Host native augmentation and progress

The automatic child graph result distinguishes `complete`, `needs-native-material` and
`needs-user-decision`. Without `nativeAugmentation`, the parent receives native
requests and may extend the same session with validated material. They are not
human interrupts. With the explicit option below, the example graph resolves the
requested capability/purpose into a code-owned instance, selects response producers
where needed, generates only actual literal settings, and extends the session
automatically. All model calls share the connection run's budget and cancellation.
There is no additional role-selection call after the role was already chosen.

```ts
const graph = createIncrementalWorkflowConnectionGraph({
  model,
  source: () => source,
  checkpointer,
  policy: {
    maxModelInvocations: 12,
    maxRejectedProposals: 3,
    deadlineMs: 240_000,
  },
  nativeAugmentation: { parameterOwnership: { parameterSource: 'literal' } },
});
```

The numbers are example host resource policy, not library defaults or API-count
limits. `parameterOwnership` is required when augmentation is enabled. Invalid or
unresolved native settings fail rather than receiving invented values. An already
added capability/purpose produces no-progress feedback rather than duplicate
material. Goals and accepted bundles remain intact. Historical rejections continue
to count toward the budget; only current-source feedback is given to the model.

The progress projection contains identities, accepted edges, explicit roots,
pending node IDs, readiness and counters. It does not serialize OAS, arguments,
requirements, prompts or raw failures. This projection is an example observation,
not the Qoopilot browser event contract. Host SSE/replay and ReactFlow integration
remain separate work.

## Completion proof and parallel joins

Completion reuses the full topology analyzer's route evidence. A node reached
through an all-input join carries completed producers from every compatible input
route. Alternative routes remain separate. This distinguishes a real bypass of a
required producer from another required parallel branch entering the same join.
The ordinary public route-state shape remains compatible; internal Map/Set proof
objects are not serialized as public completion inspections.

Actual model verification generated one native join and three accepted connection
bundles in six model calls, then executed unchanged generated JSON in an isolated
n8n instance. This was a fixed selected-API fixture, not proof of unrestricted
short-query API selection or arbitrary-scale semantic accuracy. The release record
separates deterministic regressions, model runs and execution checks.

The LangGraph graph registration and separate parent/child state boundary follow
the [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api) and
[subgraph guide](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs).
