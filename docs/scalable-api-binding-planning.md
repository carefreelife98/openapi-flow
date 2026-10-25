# API-by-API binding planning

`planApiBindings` remains the compatible single-model-call API. It sends every
selected contract and asks the model to return a row for every call. A large
selection therefore enlarges both the input and the generated output, and a
missing row rejects the entire proposal. Supporting multiple OAS documents is
not itself the problem: the global binding invocation is the unit of work.

For large selections use `planApiBindingsByCall`, or compose its independent
stages in a host-owned LangGraph:

```text
original scenario + complete selected API/native inventory
  → selectApiBindingSources: one target, compact index of every other source
  → planApiCallBindings: same target, only selected original source contracts
  → assembleApiBindingPlan: coverage, pointers, types, overlap and global cycles
```

Source selection returns only source IDs, dependency gaps and an optional reason.
Field planning returns only source/target pointers, gaps and an optional reason.
Code supplies target call IDs, fingerprints, `node-output` kinds, gap call IDs
and the final call inventory. Neither model response can regenerate or omit the
overall call list. All source identities remain discoverable, including sources
in another document or later in the selection array. Distinct invocations of one
operation retain distinct identities. No top-K pruning or same-name field mapping
is performed. Pointer names in the discovery index are advisory, not a whitelist;
selected original response/native schemas remain authoritative.

```ts
import { planApiBindingsByCall } from '@openapi-flow/langchain';
import type { ApiCallBindingPlan } from '@openapi-flow/core';

const completedCalls: ApiCallBindingPlan[] = [];
const plan = await planApiBindingsByCall({
  scenario,
  materials,
  nativeOutputs,
  model,
  concurrency: 4,
  signal,
  includeExplanations: true,
  completedCalls,
  onCallPlanned: (result) => {
    completedCalls.push(result); // The host owns persistence and approval.
  },
});
```

`concurrency` is a required positive host resource budget, not a limit on API
selection or runtime execution. It bounds model work; planning queue order is
not execution order. A target with no declared request inputs requires no model
decision. If source selection chooses no producer, code skips field generation
and preserves any declared dependency gaps. Missing independent literals remain
the subsequent argument stage's responsibility, never fabricated bindings.

Each public source/field stage is independently callable. Returned call results
contain a fingerprint of the original scenario, complete source inventory, roles,
target and explanation option. `completedCalls` is revalidated against that
snapshot before any new model call. Changed or duplicate receipts fail; completed
calls are not silently replanned or rebased. Hosts can store results in LangGraph
state or process-local memory. The convenience function itself does not create a
database, checkpoint store, agent loop or automatic retry policy.

`onCallPlanned` receives an independently cloned, contract-checked local result.
It is not an approved workflow: dependencies between different results may still
form a cycle. Final assembly requires every selected call exactly once and runs
the original global validators. Failed work never returns a partial successful
whole plan. Successful callbacks may be retained for an explicit same-input resume;
in-flight work is drained after a failure and no further tasks are started.
Cancellation is forwarded to the structured model runnable. Callback and model
failures are not repaired or retried.

With `includeExplanations: true`, existing `bindingPlanning` evidence remains and
`callPlanning` retains both source-choice and field-choice receipts. These are
private planning data for host-owned review/checkpointing, not public SSE payloads
or generated request values. Without explanations, the existing plain execution
plan shape is retained; a host may still explicitly save callback results.

## Verification and limits

A deterministic regression plans 170 distinct operations across two OAS documents
with bounded workers, complete call coverage, and cross-document response bindings.
A separate private original-OAS cohort contains 170 operations from two services:
the previous binding input was 428,340 bytes; maximum discovery input was 106,294
bytes. That cohort uses independent-call proposals, not model-generated business
semantics or live-service execution. A real Chomsky probe of the largest request
schema in that cohort accepted a 106,410-byte scoped prompt in about five seconds.
A separate real-model five-API case produced ten original-field bindings in eight
requests. Actual HTTP tool schemas are also checked against JSON Schema 2020-12.
Another actual-model run compiled its API/native binding plans and passed three
isolated n8n executions with eleven loopback requests, including a changed first
response flowing into later API requests. The execution topology was supplied by
the fixture rather than inferred by that model probe.

Smaller calls increase the total number of model requests and can increase total
latency and token usage. A single enormous request/source contract, an enormous
candidate inventory, provider rate/context/output limits and an invalid semantic
proposal can still fail explicitly. This does not guarantee arbitrary-scale model
quality or prove the cause of a historical failed request. API selection, native
planning and final graph orchestration retain their own contracts and evaluation
needs. Complete global DAG validation is intentionally retained.
