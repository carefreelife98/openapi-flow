# Human-authored review feedback

The library separates a deterministic answer from a request to change the proposal.
An offered choice still uses its original choice/API identity; literal API values
still use the original OAS validator; approval remains an explicit host action.
Do not send these actions through a model merely to interpret a known identifier.

`WorkflowClarificationReply` now accepts a nonblank `text` answer to an original
single-/multiple-choice clarification question. Core preserves the original text,
question, receipt, whitespace and source evidence. It never guesses a choice ID.
The resolution's `readyForPlanning` reports that no question remains unanswered or
deferred. It does not establish semantic completeness or approve a workflow.
The next planner must still return valid choices, further questions or capability
gaps when the supplied meaning cannot support a concrete plan.

For feedback on a proposed API set, input plan or candidate workflow, the host
provides its exact current `WorkflowReviewBoundary` and derives the response schema:

```ts
const feedbackSchema = createWorkflowReviewFeedbackSchema(boundary);
const responseSchema = z.union([originalAnswerSchema, feedbackSchema]);
```

`WorkflowReviewFeedback` contains `kind: 'review-feedback'`, the exact boundary key
and revision, an explicit review/question scope, and the human's original text.
Only current question IDs are accepted; a boundary without questions accepts only
review scope. Missing scope, stale identities/revisions, blank text and mixed
choice/approval/value fields fail. Typing an approval-like sentence does not create
an approval. The schema never relaxes the OAS or a registered native capability.

After authenticating the human action and checking the current interrupt, call
`createWorkflowReviewFeedback` with a host-allocated message ID. The immutable
receipt retains the source question, review identity and original message. It
chooses no API, applies no edit and invokes no model. `isWorkflowReviewFeedback`
is structural dispatch only, not acceptance against a current review.

The host owns LangGraph state, checkpointing and routing. A semantic API change
normally revisits API selection; a candidate change revisits edit planning and
invalidates affected approvals through the existing draft/edit contracts. A
question-level clarification answer need not restart its question-generation
model. Keep prior canonical JSON unchanged until the replacement candidate is
validated and approved. Do not infer a new selection from a similar display label,
automatically approve a revised proposal, discard original input evidence, or hide
model failures with retries. The UI may share one composer while clearly showing
the exact question/review and action it will submit.

This is a composable library contract, not a shipped server, universal chatbot,
automatic replan policy or proof of model quality. The separate host must verify
its real resume, edit, browser and execution paths. The source-only reference
LangGraph is not automatically changed by importing this API.
