# Incremental connection planning (0.3.17)

## 0.4.2 candidate: business intent before material planning

`planWorkflowIntent` is an independently callable upstream semantic planner. It
reads the original scenario and explicit user messages before any API/native
selection. It returns a current objective, task roles classified as `required`,
`conditional`, or `excluded`, and business sequence/parallel/collection intentions.
It does not invent concrete API/native IDs, request values, ports, response paths,
or executable edges. Source IDs are selected from supplied messages; Core attaches
unchanged source text and derives role identities. No quotations are regenerated.

Core validates source and role references and prevents inactive roles from being
activated by an overview flow. These structural checks do not prove that the model
understood the business meaning. `validateWorkflowIntent` verifies a saved receipt
against its original input. `formatWorkflowIntentScenario` creates shared planning
context for API selection, native planning, binding and connection stages; it is
never an original literal-value source. Actual OAS/native contract and whole-graph
checks still run after concrete materials are available.

```ts
const intent = await planWorkflowIntent({ scenario, messages, model });
const planningScenario = formatWorkflowIntentScenario({ scenario, messages, plan: intent });
```

The host owns where this one semantic call runs, its checkpoint, human feedback,
and explicit replanning after requirements change. Keep the original messages in
the separate request-value source channel. This overview is distinct from the
existing connection outline, which groups already prepared material. It adds no
explanation-only call and makes neither connection mode automatically superior.
Qoopilot integration requires a new public release; this local source addition is
not evidence of a fresh end-to-end generation or UI result.

## Unreleased: checkpointed dependent API arguments

The consumer example accepts explicit `materialRecovery.argumentPlanning` with
`model`, optional `observe`, and optional
`selectDeferredApiInputIds(inspection, proposedDeferredApiInputIds)`. Its `replan`
callback returns the actual pending binding/material replacement, not an already
completed dependent-work submission. Core derives dependent value tasks from that
replacement and the original OAS, scenario and roles. No model invents the task
schedule or request schema.

`generateMaterialArguments` invokes `generateApiArguments` for one task using one
reservation from the shared budget. Its result is checkpointed before
`publishMaterialArguments` emits only call ID and counts. Notification failure
resumes notification without repeating the callback or completed API calls.
`finishMaterialArguments` combines assigned values without changing bindings,
media type, native settings or unassigned calls. Existing Core work application
validates the whole replacement before adoption. Accepted-session repairs remain
private candidates until the existing revision/review/adoption path finishes.
The task array orders planning work, never execution edges.

Every task boundary rederives work and checks saved task identities, bindings,
media types and unresolved-input reports through Core. Runtime models, functions,
signals and registries are not checkpoint data. Transport failures preserve earlier
results but do not trigger hidden retries or reset a terminal failure. Memory
checkpoints do not survive process replacement. A response lost before its node
commits is not an exactly-once guarantee.

The optional final input policy receives actual post-generation slots and earlier
proposed deferral IDs separately. Provisional approvals are not applied while
inspecting changed values; this explicit policy returns the complete intended
current approval list. No values are removed or filled to make approvals valid.
Without the policy, original approvals are retained and Core rejects missing/stale
approvals. Core still protects unrelated approvals.

The older callback-owned `dependent-api-arguments` submission remains available
without `argumentPlanning`. Arbitrary work still performed inside that callback is
not individually checkpointed by this option.

```sh
node integration/initial-material-recovery-local-n8n.mjs --with-goal-review --with-deferred-api-input --with-argument-work --checkpoint-argument-work
```

This deterministic regression uses fixed synthetic 5-API material and stub decisions,
forces a post-checkpoint notification failure, then compiles and executes in isolated
n8n. It is not actual-model quality, original-five independent generation, or Qoopilot
server/UI integration. Installed Qoopilot remains public 0.3.18.

This source adds independently callable connection-planning stages. Publication
status is tracked in the [release record](releases/0.3.17.md). A host-owned automatic
LangGraph composition lives in `examples/langgraph-workflow`, including opt-in
native material generation. Host streaming UI and broad short-query quality
evaluation remain separate work; these libraries do not ship a server or UI.

## Ownership and flow

### Unreleased: global outline and scoped connection bundles

`planWorkflowConnectionOutline` performs one structured model call against the
full original facts, accepted goals and actual material. The model supplies only
a purpose and work bundles: actual node/goal/fact references and short reasons.
It does not supply IDs, fingerprints, execution edges or completion flags. Core's
`createWorkflowConnectionOutline` checks distinct actual references and coverage
of every supplied node, goal and fact, then derives stable structural identities.
Wording and array order do not affect those identities. Referencing a fact is not
proof that its meaning is satisfied; optional independent review remains separate.

`describeWorkflowConnectionOutline` recomputes pending nodes, unmet goals and open
boundaries from the current session. `describeWorkflowConnectionOutlineBundle`
adds the actual transitive producer closure and existing crossing edges. Every
step still receives the global compact contracts, facts, goals and accepted edges;
there is no Top-K truncation or isolated subgraph masquerading as the whole plan.
Bundle members may overlap at branch/join boundaries. No artificial bundle count
or node count limit is imposed, and a model may propose a single large bundle.

`planWorkflowConnectionStep` accepts `outline` and `bundleId` together or neither.
The scoped output schema permits added/removed edges only when at least one end
touches an actual bundle member. Roots and terminals must belong to the bundle or
the actual proposed edge boundary. `applyWorkflowConnectionOutlineStep` repeats
the write-ownership check in Core, then delegates to the original revision, source,
protected-edge, cycle, route and completion checks. A local patch does not mean
global completion. Planning one bundle before another never creates an execution
dependency between them.

An outline survives edge-only revisions. A supplied `previousOutline` may be
regrouped explicitly within the same source/session/goal epoch, retaining accepted
edges and history. Changed material or goals invalidate that outline; the consumer
must explicitly plan a new one and may retain the old one as history. Input drift,
cancellation and malformed output remain errors with their original causes, not
business questions or automatic retries. Connection-step input drift now reports
`input-validation` / `PLANNING_INPUT_INVALID`, rather than a replannable
`contract-validation` proposal failure. Both malformed output and concurrent input
drift are retained when they overlap. Accepted-session recovery is an independent
opt-in consumer composition described below, not a package-internal retry loop.

### Unreleased: recovering an already accepted partial plan

The consumer graph accepts explicit `revisionPlanning: { model, observe? }`.
After Core rejects a connection proposal, the host reserves a new invocation for
`planWorkflowConnectionRevision`. Its optional `rejectedConnections` contains
original failed decisions and witnesses for the exact current session/revision.
The planner considers goals, actual mappings and graph changes together; it does
not assume that an accepted goal or a newly proposed binding is user truth.

A `replan-materials` result uses the existing explicit `materialRecovery.replan`
callback and invocation lease. If that executor is absent, the graph fails with
the missing configuration named; it never invents a dispatcher or asks the user
to perform technical wiring. Actual replacement/work receipts remain in private
`pendingRevisionRepairs`, not the canonical accepted source. The next revision
call sees both accepted contracts and that candidate material. Existing dependent
argument work, input-slot policy and ownership checks still apply. Multiple calls
inside a caller-owned callback are not separately checkpointed; use the explicit
dependent-argument stages above for per-API persistence.

`reviseAcceptedPlan`, `reviewRevisedGoals`, `adoptRevision` and `publishRevision`
are actual consumer nodes. If `initialGoalReview` is configured together with
revision planning, that same explicit reviewer also checks revised goal/material
interpretation before adoption. A negative judgment is stored as
`WorkflowReviewedConnectionRevision` and supplied through `rejectedGoalReviews`
to the next one-shot planner. Each record is checked against the actual revision
and original requirements; a positive judgment cannot be submitted as rejection
history. An identical negatively reviewed candidate is not sent for another review.
This remains fallible semantic judgment, not proof of business correctness or a
review of the entire execution graph. Concurrent feedback changes remain input
failures even when model output is malformed; both causes are retained privately.

The host adopts only after replaying Core's revision and the configured positive
review. Until then, accepted material/session/edges stay unchanged. On adoption,
Core owns source baseline updates, changed/affected nodes and assessment
invalidation. A new outline is explicitly planned for the new epoch if enabled.
Transport, cancellation and callback failure keep their original failure path;
saved candidates or observer failures cannot secretly repeat a model call.
All proposal/review/recovery invocations and rejections share the original budget.

Revision-enabled checkpoints use ordered `sourceEvents`: initial material repair,
native extension and accepted revision receipts. Each read replays public Core
functions against the immutable runtime-provided base. It never guesses event
order from separate arrays, trusts a `checked` flag, or checkpoints a runtime
model/registry. Native extensions can occur between accepted revisions. Reordered,
altered or history-replacing receipts fail. The example's
`resolveIncrementalConnectionSource` exposes that checked current source to an
example consumer such as engine compilation; it is not a new Core planner.

Revision mode is opt-in and requires its own explicit source/rejection/candidate
ledgers on resume. Existing non-revision paths remain unchanged; old checkpoints
are not silently upgraded. Qoopilot's installed public 0.3.18 and actual UI are
unchanged. The host still needs product integration, any additional callback-specific resume and
original five-scenario evaluation. For synthetic SDK/engine validation, run
`node integration/accepted-revision-local-n8n.mjs --with-goal-review`.

`describeWorkflowConnectionOutlineRequest` returns the current private planning
description and a code-owned request fingerprint. That fingerprint includes the
actual session revision, goals, global context and optional previous grouping.
`createWorkflowConnectionOutlineRejection` classifies only lossless JSON output
failures from `planWorkflowConnectionOutline` against that unchanged request.
Other operations, transport, cancellation, input drift and non-JSON results are
not correction feedback. It preserves the exact failed proposal and validation
reason, not a repaired or default-filled proposal. Public error JSON never exposes
this private feedback or the request fingerprint. Fingerprints check consistency;
they do not authenticate caller-supplied data or prove semantic correctness.

The planner optionally accepts `rejectedProposals` from the exact request. It
validates them before any model call, sends their original output/reason alongside
unchanged facts and checks concurrent feedback mutation even when the next output
is malformed. A direct library invocation still makes exactly one call. The
consumer example checkpoints `rejectedOutlineProposals` and schedules another
outline call only through the existing shared reservation/rejection/deadline
policy. Rejections from earlier material epochs remain in accounting/history but
are not sent as feedback for a different request. No API-wise HITL or single-call
fallback is added. An outline-enabled checkpoint must explicitly contain its
rejection history; pre-change local checkpoints are not silently migrated.

The optional consumer graph uses explicit
`outlinePlanning: { model, selectBundle, observe? }`. It adds `planOutline` and
`publishOutline`, reserves one shared invocation, saves the result before observer
notification and checkpoints each accepted bundle. `selectBundle` is required host
policy using actual Core progress and rejection evidence; no hidden model or
first-pending-bundle fallback is installed. An observer failure resumes notification
without repeating the model. Native extension invalidates the previous outline
and explicitly schedules another under the same budget. No per-API HITL is added.

Core and LangChain own the public contracts and one-shot planners. The example is
a consumer of those APIs, not package-internal orchestration or an installed
Qoopilot implementation. Qoopilot must import the public types, compose its own
budget/checkpoints/HITL and send safe shared events to the UI. Its installed public
0.3.18 and frontend remain unchanged. Stub-based tests and isolated engine execution
do not establish actual-model quality or original five-scenario equivalence.

### Unreleased: independent initial goal/material coverage review

`reviewWorkflowConnectionGoals` performs one additional, independently instructed
model call against the complete original requirement text, candidate goals and
actual mappings/settings. It does not regenerate a plan. The model assesses every
code-supplied fact key as `covered`, `missing`, `contradicted` or `uncertain`, with
actual goal/policy IDs, exact source quotes and a short evidence-based explanation. A
fact may contain several clauses; citing its ID alone is not coverage.

Core owns `describeWorkflowConnectionGoalReview`,
`createWorkflowConnectionGoalReview` and `validateWorkflowConnectionGoalReview`.
They check complete/distinct fact rows, actual goal/policy identities, exact quotes,
source/session/goal fingerprints and lossless data. Code derives `accepted` only
when every row is `covered`; the model never generates acceptance or provenance
metadata. A review can be replayed after edge-only revisions because its target
is the goals/material, not final route correctness. Changed material or goals
require a new review. Full graph checks and final review remain necessary.
Receipts check consistency, not caller authenticity or a signature proving that a
model produced the judgment.

The review description has an explicit
`initial-goal-interpretation-before-connection-planning` scope. It projects node
contracts and data material, not the unfinished working graph or its empty edges,
roots and terminals. Required control flow must be expressed by goals, not already
implemented at this stage. Protected-original-edge preservation is supplied as an
actual code-enforced policy; an empty protected-edge set is not a missing workflow.
Policy evidence cannot stand in for data semantics or new execution connections.

This is **model judgment, not a deterministic proof** of natural-language meaning.
A model can incorrectly claim that a clause is covered. The code checks its
provenance and evidence references, not the truth of that semantic claim. Source
obligations remain unchanged and separate from revisable implementation hypotheses.
No word/path/field-name rules or predetermined goal corrections are used.

The consumer example's opt-in `initialGoalReview: { model }` reserves one shared
invocation for each candidate review. A candidate stays in `pendingGoalSession`
until a checked positive review; it is not the accepted session or a public graph.
Rejected reviews retain their original candidate and are supplied privately through
`rejectedGoalReviews` to goal generation/recovery. With `materialRecovery` enabled,
the host can invoke the actual originating stage rather than force goals to agree
with an incorrect binding. The negative review consumes the existing rejection
budget. Transport/cancellation/invalid review output remain failures, not business
HITL or hidden retries. Successful results survive observer failure in checkpoints.

The reviewer model is explicit host configuration, not a new provider adapter or
an implicit model choice. Review records never contain runtime clients/functions
and are not automatically streamed to browsers. This option reviews **initial**
goals/material; it does not claim to review every later accepted-session revision
or final workflow, and it does not implement hierarchical bundle scheduling.
Qoopilot's installed public 0.3.18 is unchanged.

### Unreleased: recovering before an accepted session exists

A rejected initial goal/material pair has no valid session to revise. Repeating
only goal generation would treat existing bindings as fixed truth. Instead,
`planWorkflowConnectionGoalRecovery` accepts the unchanged source and its actual
`createWorkflowConnectionGoalRejection` evidence. One model call returns either:

- `goals`: corrected goals validated into a new session against the same material;
- `replan-materials`: actual API/native stage targets, fact IDs and a reason, bound
  by code to the source fingerprint. It contains no fabricated replacement values.

`describeWorkflowConnectionConflictMaterials` projects actual target mappings,
request schemas, native definitions/settings and transitive producer contracts.
These are private planning inputs, not public SSE content. Code verifies consistency
with the supplied contracts; it does not prove the model's business interpretation.

The host invokes the requested planner with its own original context. It returns
`WorkflowConnectionMaterialReplacement`, using
`selectWorkflowConnectionArgumentValues` to project execution fields rather than
copy model/audit records into replacement arguments. `applyWorkflowConnectionMaterialRepair`
then checks the source, exact targets and original OAS. An `api-bindings` repair
cannot change literal values, unresolved inputs or media type. An `api-arguments`
repair cannot change bindings. Native identity, capability and runtime ownership
remain unchanged; no unrelated material, requirements or edges can be replaced.
Requests that need a different ownership boundary fail instead of being broadened.

#### Available stages and dependent API argument work

`materialRepairStages` in the goal/revision description derives primary API stage
choices from the existing OAS argument-ownership contract. Calls with no editable
request inputs have no API binding choice; calls whose inputs are fully bound have
no independent argument choice. The recovery/revision model schemas use those same
stage-specific IDs, and Core checks direct requests as well. This constrains repair
work, not OAS intake or API selection. Native repair stages remain identity-based;
this is not proof of their necessity or complete native stage-availability support.

After actual binding results, `describeWorkflowConnectionMaterialRepairWork` checks
the pending request and bindings, then derives argument tasks only for explicitly
requested literals or inputs released by the changed binding ownership. Changing
only a producer or declaration order creates no redundant argument task. Task input
contains the unchanged scenario, role, OAS, selected media type and actual new
bindings; the existing typed generation contract excludes bound fields. The model
does not predict or invent that contract. Existing unbound literals remain revisable
within an explicitly assigned argument task; they are not promoted to user facts.

The returned `originalRequest` stays unchanged. `request` adds only the derived API
argument targets, and `apiArgumentTasks` describes the actual remaining work. The
host calls `generateApiArguments` with its explicit model/signal and original input
policy. No planner loop, values or execution order are created inside Core.
The task list describes planning work, not execution edges or API-call ordering.

`applyWorkflowConnectionMaterialRepairWork` takes that work description, its
`pendingReplacement` and actual final `replacement`. It rederives the work from the
original request, checks the exact source/OAS and freezes pending bindings, media
types, native results and unassigned APIs. The final material still passes normal
OAS, binding and input-readiness checks; complete route checking remains at connection
completion. Its receipt retains `workSource`, so replay derives the
dependent targets from the original pending result again rather than trusting a
stored task list. This is consistency/provenance checking, not receipt authentication.

The consumer example's existing `materialRecovery.replan` callback may return a
`WorkflowConnectionMaterialRepairWorkSubmission` with
`kind: 'dependent-api-arguments'`, `work`, `pendingReplacement`, and `replacement`.
It keeps the same pre-reserved model lease, cancellation and host-owned loop. The
result is checkpointed before progress notification; an observer retry does not
repeat the binding or argument planners. Plain replacement results retain their
existing field ownership. Multiple dependent calls inside one callback are not
individually checkpointed by this addition.

Run the fixed host composition with
`node integration/initial-material-recovery-local-n8n.mjs --with-goal-review --with-deferred-api-input --with-argument-work`.
It exercises one additional typed argument-model stub call, explicit runtime-input
policy, saved work provenance, SDK output and two isolated n8n executions. It is not
a fresh Chomsky evaluation or an installed Qoopilot upgrade.

#### Pending replacements and input policy

A binding change can expose a required request field that was previously supplied
by a producer. `inspectWorkflowConnectionMaterialRepairInputs` inspects that pending
replacement **before adoption**. It returns current OAS-derived slots, retained and
retired approvals, unapproved slots, and source/replacement fingerprints. It does
not return an accepted source or approve an input policy. Final binding availability,
native contracts, baseline edges and readiness are still checked by `apply`.

The host must choose how to handle the newly missing input using its original
requirements and input policy: invoke the appropriate argument stage, request a
genuinely missing user value, or explicitly permit an execution-time slot. Binding
and literal field ownership remain separate; replacing literal values also requires
an `api-arguments` target. The inspector never invents a literal or selects another
response with a similar field name.

For execution-time inputs, the host returns the optional
`replacement.deferredApiInputIds` as the complete current authorization list.
Omission retains the original list; it does not approve new slots or retire stale
ones. An explicitly supplied list must contain actual current slots and preserve
approvals owned by unrelated APIs. Unknown, duplicate, stale or unauthorized missing
inputs fail. Receipt replay repeats these checks against the original source.
No model output or checked flag substitutes for the actual replacement and policy.

The consumer's existing `materialRecovery.replan` callback can inspect its actual
result and attach an explicit policy result before returning it. Scheduling that
work, applying the existing user-input policy and saving the callback result remain
host responsibilities; this does not introduce a new loop or HITL inside Core.
Optional `requestedInputs` absence versus `[]` is comparison-only metadata, not
execution progress. Nonempty requested paths and literal-array order stay meaningful;
neither argument record is rewritten during the comparison.

The fixed synthetic regression is
`node integration/initial-material-recovery-local-n8n.mjs --with-goal-review --with-deferred-api-input`.
This test host explicitly defers the newly independent price input, compiles the
slot template, then supplies two distinct runtime values through the public template
compiler. The original source response, detail response and independent input have
different IDs. This verifies the consumer/Core/SDK/engine boundary, not actual model
quality, the original-five end-to-end comparison or Qoopilot installation.

Only a checked replacement receives a receipt. The host preserves the original
source and replays every receipt through `replayWorkflowConnectionMaterialRepair`
before reuse. No checked flag, silent rebase or mutated original is trusted. Binding
declaration ordering and audit-only differences are not execution progress; actual
literal-array order remains meaningful and unchanged by comparison.

### Unreleased: existing-native producer and parameter repair

`planWorkflowConnectionNativeDependencies` and
`generateWorkflowConnectionNativeParameters` repair existing material without
reselecting roles, allocating IDs or constructing a completed draft prematurely.
Core supplies the dependency schema's exact requested target keys and actual
producer IDs. It combines proposed choices with preserved API/native references
for cycle checks, including cycles that cross an API and a native node. The model
never generates the unchanged rows or runtime DAG edges.

Pass the original `source` and source-bound `request` to both functions. Parameter
generation for a `native-dependencies` target requires the exact Core-checked
dependency result. Parameter-only targets retain their actual existing producer
IDs, and direct material application enforces the same restriction. Both modes
keep the original capability and execution-input ownership. Only selected actual
producer outputs/response contracts reach parameter generation; API request
contracts are not duplicated into either model prompt.

For multiple native targets, pass ordered `completedParameters` results. Core
replays every ready result against the same request and its exact preceding
results, rejecting duplicates, changed receipts and stale ordering. It derives
current outputs from these candidates and defers unfinished requested targets.
It does not substitute the old target output when its new contract is not ready.
Changed output contracts can therefore reach the next target before adoption,
while all affected material remains private. Final material apply rebinds actual
native contracts and checks downstream references. Session/revision acceptance
and final graph readiness remain separate required checks.

A ready parameter result is a locally validated candidate, not an adopted
replacement or a completed workflow. A genuine missing business setting can
produce the existing explicit question-result shape, bound to this repair's
fingerprint; it is not an approval of a fabricated setting or interchangeable
with an initial-selection question. These functions own no hidden retry,
checkpoint, budget, new native implementation, execution or automatic adoption.
Zero-source choices and fully runtime-owned settings remain code-only.
`WorkflowConnectionNativeRepairError` retains the exact rejected response and
repair fingerprint privately with its original cause and named operation;
transport/cancellation errors are not relabeled as material rejections. The
initial/revision repair-choice schema explains each stage's producer/value
ownership before the model chooses a recovery target.

The initial and repair planners share the native value/question schema and
parameter-producer extraction. The new functions and types are public exports in
the unreleased source only. Qoopilot still installs public 0.4.0; its originating
dispatcher, ordered progress storage, accepted/candidate atomic transition and
full original-five comparison remain separate work.

Core's returned source contains planning contracts, not the n8n compiler registry.
For n8n compilation, retain the host's original n8n capability implementations
and call `resolveN8nNativeMaterials` with those definitions and the actual repaired
nodes/API materials. Never substitute a Core contract when the adapter's compiler
is missing. This explicit ownership boundary also applies to other engines.

Verification: 17 new native boundary/adapter/actual-SDK HTTP cases and one API
source-format boundary case passed in the full suite (1,709/1,710, the same known Ajv
prototype-key failure, no skips/cancellations).
Original private OAS regression passed 59 cases across four documents; strict
types, build, Lint, format and independent three-package installation passed.
An additional independent consumer exercised the new native functions. A fixed
isolated n8n 2.37.10 before/after comparison (two conditions, four executions in
two verified-source runs) returned no child items for the wrong
producer and preserved `0`, `false`, the expression-looking literal string and
`3` after correction. Its model responses were scripted, with no real model or
business API call. An initial fixture lacked bound native contracts, another
inherited the wrong dependency receipt, and the first engine harness supplied
Core contracts instead of n8n compiler definitions; these were corrected at their
own boundaries and rerun. This is not original-five generation quality or product
UI/dispatcher verification.

### Unreleased: explicit API repair feedback at the originating planner

`selectApiBindingSources`, `planApiCallBindings` and `generateApiArguments` accept
optional `materialRepair` with the original `source` and source-bound `request`.
Core's `describeWorkflowConnectionApiRepair` checks the actual originating input:
stage, call identity, immutable scenario/role/OAS, complete supplied producer
contracts and the request's actual requirement IDs. A valid repair label alone is
not sufficient. Missing fields, stale snapshots and unrelated targets fail before
model invocation. The descriptor is private model data, not a browser/SSE payload.

Remaining integration constraint: a host's polished connection intent and its
original-message/answer JSON projection are not necessarily the same source text.
Simply adding a second scenario string does not solve literal attribution inside
a JSON-string envelope: the scanner intentionally rejects partial extraction
from a protected literal. That attempted addition was not adopted; the regression
asserts this existing rejection, not JSON-envelope support. Original source
messages/answers need an explicit primary-source channel before that host format
can be integrated without loosening validation or changing the original input.

For argument work released by a binding change, also supply `pendingReplacement`.
Core rederives `describeWorkflowConnectionMaterialRepairWork` and verifies the
actual task/bindings before generating values. Do not append the reason to the
scenario or treat the pending material as already adopted. Literal repair uses
the existing tracked typed-output/source-quotation schema even when the caller
did not separately enable input tracking: only quotations from the unchanged
scenario can justify model literals. It never exposes old bound-field definitions
or old literal values as a new source. An independent enum decision still uses
the existing explicitly enabled OAS enum interpretation stage.

The adapters send `materialRepair` separately, recheck it after the model returns,
and preserve the no-feedback path. Rejection feedback also binds this repair
description, so a changed reason/source cannot reuse an old argument rejection.
Fully bound arguments and independent no-source field mapping remain code-only.
There is no automatic retry, replacement adoption or new value default. Use the
existing apply/work/replay APIs after planning and let the host own checkpoint,
budget and atomic revision. Native-origin repair has the separate functions above;
the Qoopilot dispatcher remains work. This unreleased API addition is not installed in the
public 0.4.0 packages or Qoopilot.

API feedback baseline at `c58b5a7`: 13 new boundary/adapter/real-SDK HTTP-wire cases, 54 focused cases,
59 original-private-OAS cases across four files, and an independent three-package
consumer passed. The full suite passed 1,691/1,692 with the previously documented
Ajv prototype-key failure and no skips/cancellations. Strict types, build, Lint and
format passed. Early test/build overlap, a missing required OAS directory and two
test Lint errors were corrected and rerun without weakening product checks. No
actual model, business API or n8n execution was performed for this API-only change.

```ts
const sources = await selectApiBindingSources({
  ...bindingInput,
  model,
  materialRepair: { source: originalSource, request: repairRequest },
});
const bindingPlan = await planApiCallBindings({
  ...bindingInput,
  model,
  sources,
  materialRepair: { source: originalSource, request: repairRequest },
});
// After constructing pendingReplacement and deriving work with Core:
for (const task of work.apiArgumentTasks) {
  const argumentsResult = await generateApiArguments({
    ...task.input,
    model,
    materialRepair: {
      source: originalSource,
      request: repairRequest,
      pendingReplacement,
    },
  });
  // The host checkpoints each result before Core's apply/work/replay boundary.
}
```

The optional `materialRecovery` setting on the **consumer example**
`createIncrementalWorkflowConnectionGraph` demonstrates dispatch, shared budgets,
checkpointing and progress. It is not a loop inside the importable packages and
is not installed in Qoopilot's public 0.3.18 dependency. The caller supplies:

- `replan`: an originating-stage dispatcher using actual public planners and the
  caller's original context, not hardcoded service/path repairs;
- `modelInvocations`: a nonnegative structured-output invocation allowance per
  dispatch, reserved from the run budget **before** the callback starts;
- optional `observe`: phase/target/count progress, without raw material or values.

Zero allows deterministic callback work and no model invocation. Positive unused
allowances are not refunded. Counts are reservations, not provider HTTP attempts,
tokens or routing retries. The callback's leased model supports
`withStructuredOutput(...).invoke(...)`, enforces the shared allowance across its
runnables and forwards the cancellation/deadline signal even if the callback omits
it. It rejects unsupported direct, stream and batch entry points and closes on
callback return. This is a supported-path resource boundary, **not a sandbox**:
arbitrary caller code using a separate model/client is the host's responsibility.
The dispatcher must await its work; unawaited provider requests are not an
exactly-once execution guarantee. Runtime options are snapshotted at graph creation.

The example saves the replacement before application/observation. If observation
fails, the same checkpoint resumes notification without re-running its model or
dispatcher. Technical callback failures remain original exceptions, not business
HITL or unreserved retries. Models, callbacks, clients and abort controllers are
never checkpoint data. All four target-stage names are a protocol, not a promise
that every product has implemented each dispatcher. Accepted-session revision and
global outline/bundle scheduling are separate opt-in compositions above; their
Qoopilot integration and checkpointing of arbitrary callback-owned work remain
separate work; dependent API arguments have the explicit opt-in stages above.

Validation distinguishes mechanics from quality. The fixed synthetic 5-API
recovery regression executes the corrected material twice in isolated n8n using
distinct original/detail IDs. A separate actual-model probe seeds only the first
rejected goal hypothesis, then uses Chomsky for recovery and connections. That
probe produced a structurally complete graph by dropping a confirmed independence
requirement and retaining the wrong binding; it failed the independent requirement
oracle and did not execute n8n. Its responses and failure are retained privately.
Neither this failure nor the fixed engine regression is a full original-five
generation evaluation. Requirement coverage across revised goals still needs
stronger planning/review support; prompt instructions are not a deterministic proof.
In this probe, several business obligations share one requirement fact ID.
`resolveConnectionGoals` checks that each supplied fact ID is referenced and that
the proposed structural goals are consistent. It does not establish that every
clause of that fact's natural-language text is preserved. Reusing the ID in new
precedence goals therefore passed structural validation without preserving the
independence clause. Keep original obligations separate from revisable planning
hypotheses; a missing obligation must not be hidden by a complete DAG.

### Unreleased: revising accepted planning hypotheses

`describeWorkflowConnectionRevision`, `applyWorkflowConnectionRevision` and
`validateWorkflowConnectionRevision` support an explicit transition between two
material epochs. The caller supplies the original session/source, its exact
expectation, and actual replanned material. Requirements, scenario, API identities,
OAS and original-edge permissions cannot be changed by a technical repair.

`planWorkflowConnectionRevision` performs one model invocation, with two outcomes:

- `revised-connections`: a complete goal set and explicit edge changes are checked
  and returned as a new candidate; code owns boundaries, identity and impact.
- `replan-materials`: actual node/stage targets for API bindings/arguments or native
  dependencies/parameters in `request.targets`, with a code-owned `expected`
  binding to the old session and actual replacement source. Call
  `validateWorkflowConnectionMaterialRepairReceipt` before dispatching a saved
  request. This is a host planning request, not technical HITL.

Neither old goals nor new bindings are automatically treated as correct. Model
context includes global requirements/roles and actual changed values, source-to-target
bindings, original request schemas and relevant transitive producer output contracts.
Same-type target swaps must remain visible. Full OAS documents, runtime registries
and audit prompts are not duplicated into that context. It is private model input,
not browser/SSE data.

`currentGraphInspection` checks the unchanged current graph against replacement
contracts. It is distinct from `before.inspection`, which uses the original
contracts. Open boundaries and concrete violations are model context, not
permission to run that graph. Runtime Map/Set route proofs are not serialized.
The description's top-level `sourceFingerprint` binds both source epochs, the
original session history and its exact expectation; it is not the replacement
source fingerprint alone. Originating-stage receipts also include this binding in
`expected.revisionSourceFingerprint`.

The revision preserves the previous session and source expectation, rechecks the
candidate under the new contracts, and reports changed/affected/preserved nodes,
goal changes, edge changes and invalidated semantic assessments. References and
routes from both epochs drive conservative causal invalidation. Unaffected evidence
may be retained; new or affected semantic claims need reassessment. This is not a
proof that a model's business interpretation is correct.

An explicitly editable original edge may be removed even when its old port no
longer exists in the replacement material. Material intake is separate from final
candidate validation. Protected edges remain non-removable. The derived
`sourceUpdate` records the next baseline; the host must adopt it together with the
session, not overwrite the original source. Removals already validated in the
previous epoch stay removed; the host must not ask to delete them a second time.
Candidate UUIDv8 identity is bound to
the previous expectation, new source and exact proposal, and recomputed on replay.
Reordering goals or rewording structural explanations alone is not progress.
Material/capability declaration order and binding-list order are not progress
either. Comparison normalization never rewrites the actual data or port order.

```ts
const result = await planWorkflowConnectionRevision({
  before: { ...originalSource, session: originalSession },
  after: replannedSource,
  expected: originalExpectation,
  model,
  signal,
});

if (result.kind === 'replan-materials') {
  // Host: call the named public planning stages for these actual targets.
  // Keep the original approved result; enforce the shared budget and checkpoint.
} else {
  const { revision } = result;
  validateWorkflowConnectionRevision({
    before: { ...originalSource, session: originalSession },
    after: replannedSource,
    expected: originalExpectation,
    proposal: revision.proposal,
    revision,
  });
  const candidateSource = { ...replannedSource, ...revision.sourceUpdate };
  if (revision.inspection.ready) {
    const plan = finalizeWorkflowConnectionSession({
      ...candidateSource,
      session: revision.session,
    });
    // Existing SDK compilation and the host review policy still apply.
  }
  // Otherwise continue automatic planning from this candidate, not from the old epoch.
}
```

The host must retain both original material snapshots for replay; `previousSession`
does not embed runtime callbacks or duplicate the original OAS. These functions do
not add a hidden retry loop, integrate themselves into Qoopilot, or replace the
planned hierarchical outline/bundle scheduler. Qoopilot's public installation is
still 0.3.18. Automatic originating-stage routing, shared budgets/progress, grouped
outlines and independent evaluation of the original five scenarios remain work.
For an actual rejected revision call, `createWorkflowConnectionRevisionRejection`
returns checkpoint-safe feedback only for unchanged source epochs and the original
session. It preserves the exact JSON model output and code-owned graph violations
or goal-conflict witnesses. Non-JSON output, transport/configuration failures,
cancellation, stale input and concurrent evidence changes are not proposal feedback.
The public error JSON still excludes raw output and witnesses. This feedback is
private model context, not a new requirement, value source or browser event.

```ts
const rejection = createWorkflowConnectionRevisionRejection({
  before: { ...originalSource, session: originalSession },
  after: replannedSource,
  expected: originalExpectation,
  error,
});
// If undefined, preserve and surface the actual failure instead of retrying it.
// Otherwise the host checkpoints it and reserves its next shared-budget attempt.
// That explicit invocation supplies rejectedProposals: [...history, rejection].
```

The revision function does not retry itself. Its budgeted host controller and
Qoopilot integration remain work. A prior real-model probe produced an extra
direct incoming route that bypassed a required producer. The feedback check
preserved that output rather than deleting its edge. A subsequent actual model
produced the corrected candidate, and isolated n8n executed its JSON. The final
source check returned a structurally valid candidate with an outstanding semantic
goal; the existing automatic connection example continued that same candidate,
obtained the assessment in one further model call, and executed the unchanged
structural plan twice in isolated n8n with distinct producer IDs. Original incomplete
output and history remain preserved. This is a synthetic fixed-material probe,
not independent full generation of the original five scenarios or a quality rate.
A successful model HTTP response alone is not a complete plan.
The final guarded source was also checked as one automatic host flow: revision,
conditional continuation through the existing connection example, and SDK/engine
verification, with cumulative call/deadline accounting. Malformed model output
cannot bypass the concurrent-input guard and become retryable feedback. Both the
input-change error and original parsing rejection remain available privately.
Supply a model configuration compatible with function tools; the OSS never changes
the model's reasoning settings or API protocol to recover an incompatible request.

`npm run test:connection-revision-local-n8n` checks a fixed synthetic five-API
repair in isolated n8n. Explicit source/detail response IDs differ, so each price
request is checked against its actual selected producer. This is not a real-model
quality or real-service test; the baseline and model decisions are fixed.

`planWorkflowConnectionGoals` interprets confirmed requirement facts as goals.
Core validates their references and coverage and creates a
`WorkflowConnectionSession`. Goal IDs and session identity are code-owned.

`planWorkflowConnectionStep` performs one structured model invocation. It receives
all supplied node contracts, OAS operation identities/descriptions, native settings,
accepted edges, open boundaries, remaining goals and explicit rejection feedback.
It returns one decision and a code-owned `expected` receipt. It neither applies
the decision nor runs a hidden planning loop.

The decision distinguishes:

- `patch`: one atomic connection bundle, with code-derived roots and terminals in the unreleased source adapter;
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

Both core patches and model proposals retain explicit start/finish intent. The
model selects supplied root identities and terminal outputs for the current work,
including explicit removals when reopening a path. It selects an output port only
when a genuine choice exists; code copies the unique declared port. Code never
places every disconnected node as a root or every unused output as a terminal.
Those graph shapes are necessary conditions, not evidence that planning is done.
A node requiring a response, native dependency, all-input join or exclusive rejoin
cannot become a root merely because it has no incoming edge. A boundary cannot
establish that a dependency ran. Core validates the complete atomic patch, including
contradictory boundaries and the outline's write region; it never repairs model
output. Existing serialized core sessions and direct core patches retain their
contracts. Scripted model doubles must follow the supplied structured schema.

Closed ancestral regions retain route/reference checks. Finalization requires all boundaries and
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

## Unreleased necessary-order inspection

`inspectWorkflowPlanningConstraints` is a model-free core API. It derives necessary
producer-before-consumer relations from selected API/native references, explicit
native prerequisites and protected edges, then compares proposed goals with those
relations. It reports cycle/independence conflicts with the involved nodes,
goal indexes and original reference pointers. Editable original edges are not
treated as protected obligations. This is not a field-name matcher, edge generator
or proof of business meaning. An absent relation does not establish safe parallel
writes. Input-port references remain scoped, not promoted to all consumer routes.

The goal description supplies these conditions before the model call. Session
creation rejects contradictory goals with `WorkflowPlanningConstraintError`.
`createWorkflowConnectionGoalRejection` retains its structured `constraints` beside
the exact rejected output for a host-owned, budgeted replan. Public error JSON
still exposes only the safe diagnostic, not this private planning evidence.
The host must not turn technical contradictions into per-edge human questions.

The same core inspection protects full topology validation; all existing route,
join and completion checks remain mandatory. A successful inspection is only a
necessary-order check, not an executable workflow or a semantic approval. The
current connection-stage replan cannot replace a wrong binding or revise an
already accepted session's goals: origin-stage replanning and impact invalidation
remain separate work. No decision is reversed or reference replaced by code.

Run `node integration/incremental-connection-local-n8n.mjs --reject-reverse-goal`
after building to verify the scripted rejection/replanning path and four isolated
n8n executions against the fixed five-API fixture. This is not a live-model or
five natural-language example evaluation.

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
