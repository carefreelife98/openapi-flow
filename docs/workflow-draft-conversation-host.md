# Canonical draft conversations in LangGraph

`createWorkflowDraftConversationGraph` is an unreleased, host-owned reference in
the private `examples/langgraph-workflow` workspace. It is not an npm package,
server, UI, execution service or mandatory OSS graph. The core, LangChain and n8n
primitives remain independently callable. This factory can start from an empty
canonical draft or continue editing a completed draft on the same thread.

The [current Korean graph](current-conversation-graph.md) shows the actual
registered topology and current work focus. `npm run graph:update` refreshes the
same document after an implementation task; regression checks reject a stale
diagram. Explicit conditional destinations prevent the graph inspector from
drawing hypothetical all-to-all paths. This is a design-conversation graph, not
the generated n8n execution DAG or a live execution trace.

## State and ownership

Optional `nativeFeatures` selects the registered OSS enum families before instance
planning. Material-dependent definitions bind actual producers later without
changing the original context fingerprint. Missing source contracts become typed
questions after independent planning, not fabricated schemas or failed-model
retries. See [native feature planning](native-feature-planning.md). Omitting this
option preserves the explicit `context.capabilities` contract.

Each turn has a distinct request ID, exact text and `expectedRevision`. Only the
first invocation accepts `initialDraft`; subsequent turns cannot replace persisted
canonical state through input. The host supplies original operation contracts,
registered n8n implementations, a model and a checkpointer. Explicit empty operation
and capability lists are supported. Use the existing catalog and registry APIs
before constructing this graph; never synthesize an OAS/native contract in a model.

The graph separates:

- opt-in structured clarification, typed replies and actual requirement scopes;
- semantic analysis and optional selection review;
- code-scheduled, individually checkpointed media/binding/literal/native stages;
- explicit consumer repairs and final connection planning;
- candidate SDK preview and optional change/impact review;
- re-derived atomic adoption and same-revision JSON, Korean guide and input slots.

Planning order is not execution order. Only explicit validated edges define the
workflow DAG. A question does not cancel independent planning work: completed
results stay pending while other ready steps progress. Unvalidated staged content
is labeled `not-an-executable-draft`; it is not exported as a successful workflow.

At the final connection checkpoint, Core can prove that a single resolved instance
needs no inter-instance edges. This implicit single-node DAG makes no connection
model call; the actual input/port/dependency conditions and exclusions are described
in [connection edits](workflow-draft-connection-edits.md). Explicit routing-change
intent is not discarded by that proof. API/native selection, required-input
questions, selection review and candidate review still run normally.

`reviewPolicy` is explicit. `review` pauses before material work and before adoption.
Only ready affected nodes receive core approval records after final approval;
unaffected approval coverage is preserved. `automatic` adopts validated decisions
without those pauses, but still asks about unresolved decisions/values. It does
not forge human approval records. Neither mode executes the resulting workflow.

Optional `planApiBindingInputs: true` adds a separately checkpointed selection of
the request inputs the user wants to receive from preceding results. Code fixes
that target set before binding/source questions, rejects additions or omissions,
and skips the binding model for an empty set. Original OAS literal generation and
required-input checks remain intact. Omitting the option preserves the existing
unscoped binding API, not the new target-scope guarantee. See
[request-input intent](workflow-draft-api-binding-questions.md#요청-의도를-먼저-고정하는-선택-단계).

Optional `trackRequestedApiInputs: true` adds requested OAS input pointers to the
existing argument-generation output, not another model node. Core distinguishes
missing scenario-requested optional literals from OAS-required fields. They become
typed questions or, with explicit `allowRuntimeInputs`, execution slots. Answer
resume, drafts, preflight and final materialization retain the same presence
contract without changing OAS requiredness or generating placeholders. Explicit
input removal withdraws that intent; operation replacement does not copy old
intents. This flag is independent from dependency-target selection. See
[requested literal inputs](workflow-draft-api-binding-questions.md#값이-미정인-선택-입력의-요청-추적).

The canonical draft remains unchanged until adoption. Approval tokens bind the
phase, complete base draft, plan, pending questions, resolutions, repairs and
candidate. They are consistency identifiers, not n8n/model authentication tokens.
Before adoption, code re-resolves original decisions and connection proposals and
compares the result to the preview; a changed preview or stale revision fails.

## Output outcomes

The host owns export status; Core already classifies an empty draft as not ready.
The public `draftConversationOutcomeSchema` and inferred
`WorkflowDraftConversationOutcome` distinguish an actual JSON export from an empty
canonical draft. They describe code-observed facts, not a new model response.

| Phase         | Outcome             | Current artifact | Meaning                                                          |
| ------------- | ------------------- | ---------------- | ---------------------------------------------------------------- |
| `exporting`   | absent              | absent           | Adoption finished; the SDK export has not succeeded.             |
| `complete`    | `workflow-exported` | present          | The SDK produced an importable template for this draft revision. |
| `no-workflow` | `no-workflow`       | absent           | The adopted draft has no API, native or gap instances to export. |

Both terminal outcomes carry the actual `draftId`, `revision` and `changeStatus`
(`changed` or `no-change`). Change status and output status are independent:
retaining a populated draft can export its unchanged JSON; removing its last node
can change the draft without producing a workflow. The event stream similarly
uses `adopted` for a real change, `unchanged` for no change, and `exported` only
after successful SDK export. A previous export event belongs to its own turn and
revision; its historical presence is not this request's result.

`workflow-exported` also reports `triggerConnected`, `runtimeInputsReady` and
`deploymentConfigured` from the actual template. Successful export is not proof
that all input slots, approvals or deployment values are ready, nor that the
workflow has executed. Download and render the template's Korean guide and input
slots together; retain its disconnected-trigger safeguards when readiness is
incomplete.

`no-workflow` has `reason: 'no-api-or-native-instances'` and the original unresolved
requirement IDs. It does **not** assert that the requested capability is absent
from every OAS, that a model's reason is correct, or that the user's request was
fulfilled. Original plans, stage results and explanations remain available for
review. Code does not invent a missing-API requirement, a replacement node or a
placeholder workflow merely because the draft is empty. Explicit capability-gap
planning uses the separate `report-capability-gap` decision described below; a
gap-only draft is not empty and exports a disconnected review artifact.

`no-workflow` ends the current request; it is not a human interrupt. Continue on
the same thread by sending a new request with a fresh ID and the current draft
revision, not `Command({ resume: ... })` without an outstanding interrupt.
Starting a new request clears the previous outcome. Adoption clears the old
artifact and enters `exporting` before calling the SDK, so an SDK error propagates
without making a stale artifact look current. The checkpoint stays pending at
export; an explicit host retry after correcting the failure can retry that stage
without replaying the model. No automatic retry or output repair is added.

## Workspace usage

The following code runs in this repository workspace, not against npm 0.2.0:

```ts
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  readClarificationQuestionLimits,
} from '@openapi-flow/core';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';

const catalog = await createApiCatalog([{ id: 'members', spec }]);
const operations = await resolveApiOperations(
  catalog,
  catalog.operations.map((item) => item.key),
);
const registry = resolveN8nNativeFeatures({
  features: [N8nNativeFeature.If, N8nNativeFeature.PassThrough],
});
const context = {
  operations,
  capabilities: registry.capabilities,
  messages: [],
};
const draft = createWorkflowDraft({
  context,
  content: {
    id: 'member-workflow',
    apiCalls: [],
    nativeNodes: [],
    requirements: [],
    edges: [],
  },
});
const checkpointer = new MemorySaver();
const graph = createWorkflowDraftConversationGraph({
  context,
  model,
  checkpointer,
  name: '회원 조회',
  reviewPolicy: 'review',
  includeExplanations: true,
  allowRuntimeInputs: false,
  planApiBindingInputs: true,
  trackRequestedApiInputs: true,
  reviewSuggestions: {
    limits: { maxSuggestions: 3 },
    includeExtensions: true,
  },
  clarification: {
    limits: readClarificationQuestionLimits(process.env),
    includeSuggestions: true,
  },
});
const config = {
  configurable: { thread_id: 'conversation-1' },
  recursionLimit: 200,
};
let result = await graph.invoke(
  {
    input: {
      initialDraft: draft,
      request: {
        id: 'request-1',
        text: '회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.',
        expectedRevision: 0,
      },
    },
  },
  config,
);

while (result.__interrupt__?.length) {
  const boundary = result.__interrupt__[0].value;
  const response = await renderAndCollectUserResponse(boundary);
  result = await graph.invoke(new Command({ resume: response }), config);
}
// Only this outcome means the current request actually exported an artifact.
const artifact =
  result.phase === 'complete' && result.outcome?.kind === 'workflow-exported'
    ? result.artifact
    : undefined;
// For no-workflow, show the original plan/reasons and accept a new user request.
// For an artifact, show its guide/input slots and readiness before offering use.
```

When enabling `clarification`, explicitly configure the host environment before
constructing the graph. These are suggested UI budgets, not implicit defaults:

```dotenv
OPENAPI_FLOW_CLARIFY_MAX_CATEGORIES=4
OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_CATEGORY=3
OPENAPI_FLOW_CLARIFY_MAX_CHOICES_PER_QUESTION=5
OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_ROUND=6
```

The reader rejects missing or invalid values. The same validated limits constrain
the model's output schema and Core's returned-question validation; excess questions
or choices are errors, not silently truncated content. Omit `clarification` to
disable this stage; the example does not read these settings in that case. The
host owns loading environment files, if any. See [question configuration](workflow-requirements-clarification.md).

`recursionLimit` above is an example host execution budget, not a limit on OAS
size or a library-enforced graph depth. For native-only use, supply `operations: []`
and a deliberately empty draft with registered implementations.

A later request uses the same thread and current canonical revision, without
`initialDraft`:

```ts
const changed = await graph.invoke(
  {
    input: {
      request: {
        id: 'request-2',
        text: '주소 조회도 추가해줘.',
        expectedRevision: result.draft.revision,
      },
    },
  },
  config,
);
```

## UI response contracts

Confirmed answers in the current clarification round can be explicitly replaced
or reopened with `revise-clarification`. This deterministic boundary preserves
before/after provenance and excludes retired answer submissions from current
model inputs. It does not reinterpret arbitrary old messages or silently change
a completed draft. See [answer revisions](workflow-clarification-answer-revisions.md).

Review boundaries expose the plan, current consistency token, base revision and,
when enabled, validated clarification facts and scope receipts. Final review also
exposes candidate impact plus read-only SDK preview. The UI can send:

```json
{ "action": "approve", "token": "<current boundary token>" }
```

With `includeExplanations: true`, all three interrupt kinds additionally expose
`planningResults`: the current `plan` when it exists, original `stageResults`,
the `connectionResult` when available, and `inputAnswerHistory`. The records are
detached copies of the typed checkpoint data, not a new model summary or an
editable replacement plan. Selection and initial clarification can legitimately
have no completed stage results; no synthetic explanation is created for them.
When the option is off, the entire `planningResults` field is absent. Original
clarification reasons remain on the clarification round itself.

The review token also binds the underlying stage, routing and input-answer
records. A previously issued token cannot approve a changed displayed reason,
even when the executable node values are unchanged. The UI renders the supplied
records as untrusted source/display data and submits only the declared response
action; it must not update the graph checkpoint from this display payload.

`revise` additionally carries `{ "message": { "id": "new-id", "text": "..." } }`.
It explicitly supersedes the pending plan, keeps canonical state unchanged and
starts semantic analysis with the new user message. `cancel` leaves canonical
content unchanged. A previously adopted artifact may still exist after a later
cancellation; it belongs to its recorded revision, not to the cancelled request.

Question boundaries expose actual missing-input schemas and source locations.
Typed `api-binding` questions additionally expose the original `bindingQuestion`,
including current operation, target input/schema and code-owned source choices.
`answer-api-bindings` accepts explicit question/choice IDs or a declared source
pointer; it applies decisions to the same planning bundle without semantic or
binding-model replay. Unknown/stale/type-incompatible answers preserve the original
plan and ask again. See [typed binding questions](workflow-draft-api-binding-questions.md).

`answer-inputs` takes a new `messageId` and typed `answers` with requirement IDs and
JSON values. Core validates them. For pending new API values, code reuses the
unchanged original proposal plus explicit confirmed inputs; it does not call a
second value-extraction model. Wrong values ask again without replaying earlier
model stages. Native/structural questions can be addressed with an explicit
`revise` message. Existing requirement edits additionally support
`answer-requirement`: the user supplies exact text, state and workflow/node scope
for a current pending step. Unknown scopes fail; no model supplies hidden defaults.
Each requirement question exposes `requirementEdit`, including the original
requirement and actual selected node identities. The old unreleased
`draftRequirement` field is now `requirementEdit.requirement`. Pending new nodes
remain eligible scope targets, while removed nodes are excluded. The host uses
Core's derived answer schema, and Core rechecks the original plan independently;
material readiness and final validation remain separate. See
[selected scope contracts](workflow-draft-requirement-edits.md).
Its actual `messageId` becomes code-owned source evidence in the candidate's
`requirementHistory`, while the original planning context stays unchanged. Explicit
requirement-only deferral can export a disconnected-start template once all actual
material work is complete. Withdrawal has its own bounded semantic decision and
retains prior history. See [requirement lifecycle](workflow-draft-requirement-history.md).

`allowRuntimeInputs: true` explicitly permits typed runtime slots instead of asking
for absent literal values. `allowRuntimeParameters` permits supported whole-object
native input ownership. Neither flag invents request data or resolves an ambiguous
producer/structure. Deployment URLs/credential references are separate compiler
inputs and are never sent to the planning model by this host.

Interrupt nodes contain no model calls, call `interrupt()` once per invocation,
persist validation issues and route back through an edge. This matches the
[official interrupt replay guidance](https://docs.langchain.com/oss/javascript/langgraph/interrupts).
Actual `MemorySaver` tests cover repeated malformed/stale replies, task histories,
separate threads and model call counts. The model/canonical candidate is not
regenerated merely because a user resumes the same review.

## Optional structured clarification

Omitting `clarification` retains the direct semantic-analysis path. Enabling it
requires explicit valid question limits before the first model call. The host
declares its actual compiler-owned Manual Trigger separately from selectable
native functions. A clear request produces no question interrupt.

`requirements-clarification` exposes the original round and resolution. Submit
`answer-clarification` with the current `token`, a new `messageId`, and core's
typed `replies`: `single-choice`, `multiple-choice`, `text` or `defer`, using the
actual question/choice IDs. The same action answers an original deferred question
at a later `draft-questions` boundary. Malformed/stale/wrong-phase replies ask
again without a new model call. A generic business change uses `revise`.

Code derives exact reply-evidence receipts; the model never writes a replacement
user message or makes a supplied human-readable prompt authoritative. All quoted
message evidence in these adapters uses ID-only model input schemas: Zod parsing
attaches captured original text before unchanged core provenance checks. Model
quote fields and unknown IDs fail; there is no quote normalization or output repair.

After material selection, the model selects only actual requirement scopes. Code
owns requirement identity, text, status and original fact/question lineage. A
deferred question about unselected optional work remains `unselected-work`, not a
fake pending API. Independent selected work can progress. Original unanswered or
deferred question IDs still block final adoption/export, even if no node is scoped.

Answering a deferred question archives the old plan and prepared results in
`clarificationHistory`, keeps canonical content unchanged and explicitly analyzes
the updated facts again. Previous results are not silently rebased; this can repeat
independent model work. Selection/final review and question boundaries expose the
current clarification and scope receipts for a renderer.

The host validates the entire supplied deployment registry first, then uses
`selectN8nTemplateDeployments` to pass only selected original document settings to
the compiler. Unknown, duplicate or malformed entries fail even when unused. No
URL or credential is copied from another source, and compiler checks are unchanged.

## Optional producer choices for new native roles

Set `planNativeDependencies: true` to add a separate `native-dependencies`
checkpoint after semantic selection/review. Omission preserves the previous
composition. Core allocates each new native ID from the edit plan; the model
chooses only the exact producer IDs and, when explanations are enabled, short
reasons. It cannot generate settings, output schemas or execution edges here.
No available choices means zero producer-model calls.

`state.nativeDependencies` retains the original plan/source receipt, and
`stageResults` exposes that same record for review. Accumulating completed settings
does not regenerate or rebase the receipt. Each new role waits for its chosen
actual sources; an unrelated available output never satisfies that dependency.
Its ownership/value stage sees only the chosen source contracts. A pending
producer's original question remains the question; downstream waits do not create
duplicate missing-input questions. A selected API's OAS response contract can be
used before its request values are complete, without claiming that it can execute.

Core's `describeWorkflowDraftNativeDependencies`,
`createWorkflowDraftNativeDependenciesSchema`,
`resolveWorkflowDraftNativeDependencies` and
`validateWorkflowDraftNativeDependencies` are independently callable. LangChain's
`planWorkflowDraftNativeDependencies` provides the zero-or-one-call wrapper.
Pass the resulting `producerDependencies` through addition and final assembly
inputs. `assembleWorkflowDraftEdit` revalidates actual completed reference IDs,
including explicitly supplied resolutions; the host also checks before asking
for final connections. Tampered/stale receipts, source substitution, unused
producers and cycles among new roles fail without repair or hidden retry.

This choice stage targets **new additions**. Existing native parameter edits and
consumer repairs retain their separate scoped APIs and validators; the receipt
does not authorize rewriting them. Revised existing producers are declared as
pending roles with no old output schema reused. Execution edges still require
separate connection planning and the full topology validator. A user revision
explicitly supersedes the plan; a later turn resets the receipt. An unchanged
review resume or explicit retry of a failed value stage retains the original one.

## Code-owned terminal removal

When a turn only removes terminal nodes (including a complete terminal subgraph),
Core's `resolveWorkflowDraftTerminalRemoval` can prove the remaining connection
change: remove only edges incident to those nodes. No surviving downstream node
may depend on a removed node, and pending material/requirement repairs prevent
this path. No new edge, binding, value or comparison is inferred.

The reference host uses this result instead of asking a connection model to
re-decide that structural deletion. `structuralConnectionResult` is a separate
code-owned record, not a fabricated model proposal. Preview/review/adoption bind
it and adoption recomputes it. A middle-node removal with surviving downstream
work retains the existing repair/connection planning path. Low-level explicit
change-set and connection-delta APIs keep their original contracts.

## Explicit capability gaps

The unreleased semantic edit decision `report-capability-gap` preserves a requested
role which the supplied contracts do not fulfill. It is not `no-change`, an input
question or a fabricated API/native implementation. Its finding is `missing-api`,
`api-contract-gap` with one actual operation candidate, or `unsupported-native`.
The finding always requires a concise user-facing reason, even when optional
explanations are disabled. Model output contains only the semantic role, finding
and original message selections; code allocates the node identity, captures the
actual supplied contract inventory and resolves unchanged original text.

Core exposes independently callable `createWorkflowDraftCapabilityGap`,
`inspectWorkflowDraftCapabilityGap` and `describeWorkflowDraftCapabilityGap`.
`WorkflowDraftContent.gapNodes` is optional, distinct from `apiCalls` and
`nativeNodes`. A gap has main control ports but no response/output data contract.
It can occupy the requested DAG position; it cannot be a value-binding source.
Independent API/native planning continues, while readiness marks the gap and its
downstream nodes `blocked-by-capability`. No missing request/response schema,
URL, value, authentication or successful result is synthesized.

The finding is scoped to the supplied OAS/native inventory, not proof that a
service has no such API or that the model examined every declaration correctly.
SHA-256 receipts detect inconsistent retained metadata; they are not signatures,
an authorization boundary or a semantic correctness guarantee. Original source
messages must remain available. Changed inventory produces `inventoryCurrent:
false` on the retained historical finding; it neither silently removes the gap
nor reattributes the old judgment to new contracts. Read-only model projections
receive role/finding/currentness, not the full inventory receipt.

`compileN8nWorkflowTemplate` reuses the existing warning-colored Korean Sticky
Note and throwing Code surrogate. Full Core validation includes gap topology;
material SDK lowering is shared with the strict compiler. Existing strict
compilation still rejects unresolved plans. A gap-only draft exports real JSON
with `outcome.kind: 'workflow-exported'` and `unresolvedGapNodeIds`; `complete`
means export completion, not fulfilled business intent. The entire template has
its Start detached while any gap remains. Review approval cannot supply the
missing capability. Explicit `remove-node` withdraws the role; removing the gap
and explicitly adding a real API/native instance uses ordinary validated edits
and connection planning, not automatic or same-ID replacement.

Start detachment is not a security boundary. Reconnecting Start can execute real
API nodes before the throwing surrogate. Hosts still own execution permission,
credential policy and user review. An isolated execution which runs only Start
is recorded as inert output verification, never business scenario success.

`npm run test:capability-gaps-local-n8n` checks gap-only and mixed API/gap JSON in
isolated n8n: original Start is inert; verification-only reconnection reaches the
surrogate and stops. See [the implementation ledger](conversational-oss-implementation.md)
and [actual-model evaluation](short-conversation-evaluation.md) for bounded evidence.

## Trace, persistence and scope

`stageResults` retains the actual typed stage outputs, proposals, optional
explanations/evidence and resolutions. `connectionResult` retains the final routing
proposal, while `candidate` and `artifact` distinguish unadopted and adopted
revisions. Typed input/requirement replies stay in the transcript and event history;
they are not labeled as a new model answer. Individual bundles keep their original
uncommitted planning snapshot; they are not silently rebased when independent work
finishes. The final full contract/DAG check still runs against all actual decisions.

The host owns UI rendering, privacy, request authentication, thread lifetime,
per-thread serialization, retries, error display and download handling. MemorySaver
does not survive process restart; it is not a replacement for durable storage when
restart recovery is required. The caller must not invoke one thread concurrently
and assume compare-and-swap semantics. Model and validation errors remain visible;
this example does not retry, repair output or replace a failed original source.

Optional [review follow-ups](workflow-review-suggestions.md) are now separately
checkpointed before every actual question/review boundary. The UI adopts a current
suggestion with `adopt-suggestion`, not `approve`; unselected suggestions never become
requirements. Explicit adoption creates a distinguishable human-action receipt and
re-enters normal analysis. Verified confirmed clarification answers carry forward
through that revision; deferred answers do not. History retains the original model
suggestions and explicit adoptions. No deployment or credential configuration enters
the follow-up model payload.

This reference is not the complete conversational product. Canonical requirement
history, current/audit evidence separation and declared native prerequisites are
composed for the tested paths. General semantic supersession, optional explanations
across every stage, safe reuse and broader quality evaluation remain open.
Selected API responses are now available independently of their
request values: a producer can appear after its consumers in planning, and a native
IF can refer to its original OAS response before the producer request is generated.
Native outputs still require actual settings/source contracts and explicit repairs.
Do not infer universal native/late-registry conversation coverage from these paths. See the
[full implementation ledger](conversational-oss-implementation.md).

`npm run test:draft-conversation-local-n8n` runs a deterministic model fixture
through the real host: IF insertion, one existing API value edit, then IF removal
and original route restoration, with six simulated UI approvals. It imports the
actual SDK JSON into isolated n8n and verifies four runtime cases. This is not a
production execution client. The same runner accepts an actual model without
changing its output. Reports and import JSON live under
`.local-artifacts/draft-conversation/`.

The separate `test:api-response-sources-local-n8n` command starts with an empty
draft and plans five APIs across two OAS documents, IF, Merge and Pass-through.
It checks response-owned requests, four independent branches, a four-input join
and both condition routes, using two simulated UI approvals. A selected response
declaration never counts as a completed request or as evidence that an API ran.
