# Conversational OSS implementation

This is the implementation ledger for the agreed conversational library scope.
It is not a claim that the complete product or its UI is implemented. Release
documents determine npm availability; source-only changes are marked separately.

## Behavior edits versus requirement-record edits (2026-10-22, 0.3.9 source)

A private host short-turn evaluation added an API successfully but also selected
an unsolicited requirement-record revision, asking for replacement text, state
and scope. Source tracing confirmed the host opens that form only for an actual
selected requirement step; it does not attach the form to every behavior edit.
The shared prompt described revision as a changed statement/state/scope without
explicitly separating record editing from behavior changes.

The common instructions and Core proposal-schema descriptions now distinguish
explicit record editing from API/native/input/source/connection changes. They
retain both decisions when both are requested. Optional OAS inputs are not
questions merely because they exist; requested unresolved inputs still belong
to their original typed planning stage. No output fields, identifiers, decision
vocabulary, runtime validation, value data or host orchestration changed.

A pre-change actual-model semantic probe reproduced API addition plus record
revision and clarification. With the source change, four one-call controls chose
API addition/connections, literal-input editing, explicit record revision and
explicit record withdrawal respectively. The paired addition calls used identical
user/OAS/draft materials. Their expanded structural output rules are equal after
excluding descriptions; description metadata changed reference deduplication,
not accepted values. Outgoing schemas were never rewritten for the comparison.
The probe constructs a valid draft explicitly and tests one semantic stage, not
the original UI checkpoint or a full host run. Reports and original model outputs
remain private in `.local-artifacts/requirement-edit-boundary/`.

Focused 65 tests pass, including actual HTTP schema validation, behavior-only
planning without allocated requirement work, typed replacement answers,
restoration and requested optional inputs. The new wire regression failed before
the source change. A test helper's unqualified global function caused an initial
lint error and was corrected without changing production validation. Semantic
classification remains a model-quality concern, not a new deterministic promise.
The host retains public 0.3.8 and existing conversations. The owner authorized
source-first 0.3.9 publication and exact-version installation exceptions, but
publication and a post-install full browser path are required before claiming
the UI improvement is delivered.

The full source test run completed with 1,196/1,197 passing and only the unchanged
owner-accepted Ajv `properties.__proto__` failure. No tests were skipped or
cancelled. Typecheck, lint and format pass. This is not a fully passing unit run
or a newly published release; the original failure stays enabled and disclosed.
After regenerating the actual conversation diagram, 54 original-OAS checks and
17 edit/wire/graph/document checks pass together. The first combined invocation
omitted the required private OAS directory and failed before that suite; the
explicit original-directory rerun is a separate successful 71-test result, not
a repaired or weakened product contract. No business service or n8n engine was
called for this guidance-only change.

After version alignment, the separate release gate passed 54 original-OAS checks,
18 isolated n8n suites, strict independent packed consumption, package metadata
and archive integrity. Units retain the same 1,196/1,197 result. The security-audit
request stalled and its test-owned child was stopped after bounded independent
requests also timed out. A fresh 20-second, zero-retry audit after the owner's
network confirmation timed out again. The original report remains blocked, not
overridden; the current vulnerability count is unverified. System certificate
trust stays enabled and no TLS or audit policy is bypassed. See the
[0.3.9 source/release record](releases/0.3.9.md) for evidence and current publication
status. Source synchronization proceeds separately from npm publication; the
host is not replaced with local source or tarballs.

## Named API response composition (2026-10-22, 0.3.8 source)

A private original-OAS reproduction reported a native capability gap for wrapping
three unchanged API responses under distinct result keys. The registered stream
collector only produced an array; Merge Append alone did not provide the requested
object structure. The original failing host remains on public 0.3.7 with its
failure intact. A new explicit `ComposeApiResponses` family owns the missing
behavior instead of changing the request, suppressing the gap or altering host
LangGraph orchestration for this scenario.

The model chooses literal output names and supplied API/pointer references only.
The implementation derives types from OAS, deduplicates source dependencies (not
output fields), derives actual input ports and uses existing official Merge/Set
SDK builders. A single source needs no Merge. Full response guards, strict source
identity, pointer availability and one-item cardinality remain enforced. Repeated
source values, dotted/empty output names and every JSON value kind retain meaning
and type. The output is a new wrapper, not a conversion of the contained data.

Focused registry/structure/source tests pass. The original-OAS suite adds both
multi-service composition and rejection of body references where the original
document declares no response value. Isolated n8n imports and executes four cases:
three independent GET branches -> compiled join/guard/Set -> an OAS POST bound to
the entire native result. The server and returned echo compare every original
value unchanged. This is local contract execution, not business-service execution.
A separate actual-model probe selects the new family without gaps using unchanged
private OAS contracts; it is one native-planning stage, not a complete UI generation
claim. No company documents or host code are added to this public repository.

The first verification runs retained harness failures: a missing model timeout,
starting original-OAS checks while a build removed `dist`, assuming a body existed
on every first API, and reading the echo execution by callId rather than its actual
SDK node name. A source build also caught an optional fragment-edge typing error;
the declared optional absence is handled without changing required values.
Those results are not relabeled as successes. Final source checks and publication
remain separately reported. Final unit results are 1,195 passing out of 1,196;
the only failure is the existing owner-accepted Ajv `properties.__proto__`
limitation. All 54 original-OAS checks, 30 focused checks, four new local execution
cases and the existing registry-planning/singleton-response n8n suites pass. The
new execution cases send 16 local requests; no business API runs. No package is
published or Qoopilot replaced until
the required source-first release authorization is granted.

The independent packed-consumer fixture now imports the new factory, enum and
parameter/input types through public package exports. Three separate test-owned
call IDs reuse one supplied original operation and explicit literal inputs; no
previous call's planning receipt is copied to those new roles. Four named output
fields, including a repeated source, retain three join inputs. Actual API fragment
names and three corresponding SDK Merge connections are checked. Stable registry
binding and unknown-source rejection are exercised without deep imports or a
model call. A separate object-workflow JSON is retained beside the consumer's
existing result.

The first independent installation succeeded but its new test fixture failed two
strict TypeScript checks: indexing a generic JSON Schema as a concrete property
map and reading optional SDK parameters without a presence check. The fixture now
compares the complete expected schema and checks required runtime fields. Neither
the library types nor `skipLibCheck: false` is weakened; the failed report remains
retained. The corrected independent installation and runtime compilation pass
without workspace symlinks or manually installed n8n transitive dependencies.
Reports explicitly identify local working-tree archives and no publication; their
unchanged version numbers do not mean the new feature is available in npm 0.3.7.
The release-candidate runner also includes the dedicated object-composition n8n
check in its required integration loop, expanding that loop to 18 suites.

The subsequent full working-tree gate completed all 18 isolated n8n suites,
54 original-OAS checks, strict independent-consumer installation/compilation,
typecheck, lint, format, zero-finding dependency audit and three verified package
archives. Units remain 1,195/1,196 with only the unchanged accepted Ajv failure;
there were no skips, cancellations or new failures. Report:
`.local-artifacts/release-candidate/0.3.7-k747Cp/report.json`. The object suite
again preserved four value cohorts through 16 local requests with no model or
business-service call. The independent consumer also exercised the new public
factory and generated its separate ten-node workflow.

This gate tested the unpublished working tree while manifests still declared
0.3.7; it is not a clean committed 0.3.8 release candidate or proof that npm 0.3.7
contains this feature. The report records the existing HEAD and tracked diff,
and the three archived package SHA-512 values were checked again after the run.
Source-first commit/push, new publication, exact-version host exceptions and
post-install end-to-end browser verification still await authorization. No
package version, public host dependency or existing conversation was changed.

The owner subsequently authorized source-first publication of all three 0.3.8
packages and exact-version-only private-host exceptions. Manifests, internal
dependencies and package READMEs are aligned. The fresh 0.3.8 gate passed all
18 isolated n8n suites and 54 original-OAS checks; the only unit failure remains
the accepted Ajv limitation. README-aligned strict consumption and the final
16 focused checks also pass. Publication and post-install host validation remain
separate; see the [0.3.8 release record](releases/0.3.8.md).

Publication and host integration subsequently completed. Source `d8ccabe` was
pushed first; all three public 0.3.8/latest packages report that gitHead and match
the independently checked archive SHA-512 values. The private host installed the
public packages with only the three authorized exact-version exceptions. All 329
host tests, strict application/test types, format, lint and production builds
pass; the original JavaScript size warning remains. A test-only correction
replaced a description-word substring check with the existing strict wire schema
and explicit private-field rejection regression.

The actual-model/browser path now completes revision 1 with three API branches
feeding the new response-object capability and zero reported gaps. Explicit
review feedback clarified sort order and response wrapping; this was a visible
user-style revision, not a hidden retry or host-specific plan. Eight model calls
produced three downloads identical to their same-revision server artifacts.
Address/authentication were absent, so the template keeps Start detached. No
business-service call or execution of this new generated workflow was performed.
This known-case result does not close general model-quality or performance work.

## Short-turn evaluation and planning/runtime contract ownership (2026-10-19)

A fresh first-attempt run of the four existing scenario cohorts observed all
12 turns using 188 original Member/ICL candidates: 10 passed and two failed across
40 actual model calls. Ten successful turns made 11 isolated n8n executions and
18 local contract-server requests, including a requested response-check failure.
Both four-turn API-only conversations passed: input answer/address addition/value
edit/removal, and response-bound JSON-body addition/value edit/removal. Cross-service
parallel selection and the subsequent join/assertions passed; removing one API
and its check failed in final connection validation. The initial clarified
unsupported-history request failed at template compilation. Original failures and
model output are retained in
`.local-artifacts/canonical-short-evaluation/1792395083290-98115/`.
These are known private contracts/cohorts, not holdout reliability or a release gate.

The compilation failure was a source-ownership bug: the template replaced the
original planning capability declarations with runtime-bound implementations,
then revalidated a clarification receipt against the changed context. The template
now retains the original context for validation, readiness and gap inventory;
runtime-bound compilers are separate named material input to API-fragment lowering
and runtime-parameter materialization. No clarification is stripped, reissued or
silently rebased. A new regression verifies original inventory/context preservation
and continued rejection of a forged clarification fingerprint.

The three original history responses were replayed with exact recorded input/schema
equality and no new model calls or corrected output. The formerly failing path
exported its detached gap JSON and ran only Start in isolated n8n, making zero
HTTP requests. This is repair verification, not fresh generation success:
`.local-artifacts/canonical-short-evaluation/1792395822000-1497/`.
A separate fresh one-call attempt instead asked a clarification question and did
not reach compilation. Its original report expected immediate export and labeled
that pause failed; an independent audit verifies it as `needs-user-decision`,
without changing the report or claiming success. See
`.local-artifacts/short-quality-clarification-pause-audit.json` and source run
`1792395692322-277`. Future driver runs distinguish unanswered HITL from execution
or planning errors. No automatic answer or rerun-until-pass policy was added.

Answer-explanation reasons were English in the Korean baseline reply. The answer
prompt and both optional reason-schema fields now specify the user's language
while preserving original values/IDs/spans. Runtime guards do not guess language,
translate output, coerce values or request a second explanation. Four actual
bounded calls observed Korean/Japanese/English reasons and a Korean unanswered
case, with unchanged typed source values and pending IDs. Script presence is an
evaluation heuristic, not a production language validator or general guarantee:
`.local-artifacts/answer-language-evaluation/1792395693217-295/`.

Focused answer/template tests passed 25/25; original OAS checks passed 49/49.
Final full root regression passed 1124/1125 with no skips/cancellations; only the
unchanged Ajv special-key synthetic case failed. Fresh build/workspace declarations,
lint and format passed. The three-tarball strict consumer passed with the original
34 ICL operations: `.local-artifacts/packed-consumer/2026-10-19T07-45-39-702Z.json`.
The native-only consumer-first SDK workflow also executed in isolated n8n:
`.local-artifacts/native-feature-planning/1792395822714-1509/`. Owned evaluation
volumes were removed and their absence checked. No business endpoint was called.

Remaining work is explicit: high-level node removal still delegates required
incident-edge cleanup to the connection model, and the retained two-input Merge
needs an explicit structural decision when only one branch remains. Do not fix
this by duplicating the remaining response, silently deleting semantic nodes,
changing Merge arity or repairing a returned plan. General clarification necessity,
semantic selection quality, unseen-service evaluation and the known Ajv issue
remain open. Product work is uncommitted/unpublished and the full goal stays active.

## Canonical capability gaps, not empty no-change results (2026-10-19)

The existing semantic call now offers `report-capability-gap`, with a mandatory
scoped reason and real candidate selection for `api-contract-gap`. Core owns gap
identity, original message capture and a supplied-contract inventory receipt.
Optional canonical `gapNodes` participate in edits, impact, topology, readiness
and review scope without advertising a usable data output. Changed inventory
marks retained findings historical rather than resolving them. The read-only
model projection excludes full inventory receipts. Semantic absence judgments
still need model/user review; receipt checks do not prove universal API absence.

Independent API/native work continues. Gap consumers are not design-ready, and
the n8n template reuses the Korean warning region/throwing surrogate while keeping
all internal control edges and detaching Start. Full Core topology validation is
retained; strict compilation still rejects unresolved plans. A gap-only draft
exports an actual review artifact, not `no-workflow`. Explicit withdrawal uses
ordinary `remove-node`, never silent replacement or value fabrication. No new
graph node/model call, retry, output repair, OAS mutation or server was added.
See [the host contract](workflow-draft-conversation-host.md#explicit-capability-gaps).

Fifteen dedicated Core/model/host tests cover capture/tamper checks, actual
operation identity, gap-only/mixed graphs, data-source rejection, independent
native work, optional HITL projections, explicit withdrawal and history/currentness.
An additional middle-gap replacement transaction uses a newly supplied real OAS
operation, explicitly removes old edges, retains both neighbors and restores a
connected SDK template without same-ID substitution or automatic gap removal.
Original-OAS integration passed 49/49 across the four unchanged snapshots. The
gap-specific OAS case checks identity preservation of an explicitly supplied
judgment; it does not claim the real API lacks a particular feature.

Isolated n8n 2.37.10 passed four expected cases, distinguishing inert default
entry from business success and verifying throwing surrogates after explicit
test-only reconnection. Actual Chomsky used 188 original candidates in five calls:
one normal member lookup and two explicitly unresolved turns across two scenarios.
The mixed follow-up preserved the original API/values and placed the gap after
that lookup. All owned volumes were removed with absence verification; no
business services, replay or retry were used. Evidence:
`.local-artifacts/capability-gaps/1792393788974-92411/report.json` and
`.local-artifacts/canonical-short-evaluation/1792393790375-92432/`.

Final root `npm test -- --test-concurrency=4` passed 1123/1124 with no skipped/cancelled
tests. The sole failure remains the unchanged Ajv `properties.__proto__` synthetic
case. Fresh root build/workspace typecheck, lint and format checks passed. The
earlier focused run expected a missing-source error from an invalid empty-message
context; tests now distinguish the required boundary from a valid context missing
the original source. No product guard was weakened. General semantic relevance,
explanation language, broad multi-turn reliability and the known Ajv issue remain
open; this checkpoint is not completion of the full product goal.

The independently installed three-tarball consumer passed strict TypeScript with
library declaration checking enabled and all 34 original ICL operations. It
checks public gap creation/inspection/projection and real detached template
compilation: `.local-artifacts/packed-consumer/2026-10-19T07-22-16-354Z.json`.
Two earlier consumer runs failed in the new verifier: an optional SDK node field
was accessed without narrowing, then expected plain text was compared with
Markdown-escaped text. The verifier now narrows the declared field, checks the
original reason in typed artifact metadata and asserts its exact escaped display.
Product types/escaping were not changed; both failed reports are retained.

## Scenario-requested optional inputs across planning and execution (2026-10-19)

OAS requiredness is not the same as the user's requested input presence. With
`trackRequestedInputs: true`, the existing API argument call returns
`requestedInputs` alongside unchanged OAS-typed values and source evidence. Core
validates these original request pointers, derives missing `requested-input`
questions separately from OAS `missing-input` questions, and preserves metadata
through answers, canonical calls, edit assembly, readiness and deferred input slots.
The host option is `trackRequestedApiInputs`; it is independently optional and
does not add a graph node/model call or imply `planApiBindingInputs`.

Parent questions retain the requested descendant paths. Original-OAS-valid `{}`
answers cannot omit those requested children. A missing parent containing another
binding-owned descendant is not offered as an overlapping question: code selects
the first absent non-overlapping container/field. Zero, false, null and empty text
retain their original meanings and types. Arrays still require an explicit
complete prefix, never synthesized holes. An explicit literal-input removal also
withdraws the affected intent, even if no literal has been supplied. Removing an
absent value with no affected declared intent still fails. Replacements never copy
old operation pointers; binding ownership changes alone do not withdraw intent.

The n8n adapter retains the metadata in strict request boundaries, template input
preflight, Korean guide and the final materializer after bindings. Missing requested
optional children stop before their HTTP request even when the OAS accepts absence.
The original OAS and schemas are not rewritten, and no default, placeholder,
type/meaning conversion, guessed mapping or model-output repair was introduced.
In-process slot schemas enforce presence independently while their wire metadata
remains the original OAS; exported preflight explicitly performs both checks.

Focused source/host/answer/edit/runtime tests passed 79/79. Original-OAS integration
passed 48/48, with a new test covering declared optional parameters across all four
snapshots. Fresh strict installation through three tarballs and 34 original ICL
operations passed without workspace symlinks or skipped library declarations:
`.local-artifacts/packed-consumer/2026-10-19T06-44-45-703Z.json`. It checks the new
public option and Core pointer metadata/presence as well as existing APIs.
The independent graph/connection source-capture schema also retains the metadata;
their ready-material boundaries and reviewable-plan validation reject omitted
scenario inputs before any model call instead of silently stripping the contract.

Root `npm test -- --test-concurrency=4` passed 1108/1109 with no skipped/cancelled
tests. The sole failure is the unchanged Ajv `properties.__proto__` synthetic case.
No special-key compatibility patch, exclusion or retry was introduced. Fresh root
build/typecheck, final workspace declarations, lint, format and whitespace checks
passed. The source-derived graph update/check and both graph tests passed, keeping
30 registered nodes and 68 routes; only the existing argument-stage label/current
work annotation changed. An initial compile caught the missing runtime `Pick`
member and focused fixtures caught omitted explanation/token setup and serialized
body expectations; the type/test fixtures were corrected without weakening product
schemas, checks or required original evidence. Logs are preserved under
`.local-artifacts/requested-inputs-*`.

Isolated n8n 2.37.10 passed seven expected outcomes: absent input, omitted requested
child and wrong type stopped before any HTTP request; valid false input executed;
a response-bound parent missing its requested child stopped after its producer;
a complete bound parent executed; an unrequested optional input stayed absent and
executed legally. The first run stopped on a verifier wording assertion because
n8n presented the pointer after the colon as its error title. The verifier now
checks actual stopping node, exact target, status and request count; the product
guard was not weakened or rewritten to satisfy it. Both runs are preserved, and
owned volumes were removed with absence verification. Final report:
`.local-artifacts/requested-api-inputs/1792391677786-86000/report.json`.

Actual Chomsky used all 188 original Member/ICL candidates and the registered
native inventory. Ten real calls, no replay/retry, produced and executed all three
turns: initial member lookup; add address lookup with an unknown requested
`addrType`, answer the actual input question; remove only that filter. The user
response was applied to the original plan, and cancellation retained both APIs and
the response-member-ID binding. Three SDK workflows made five local requests,
with no business API calls. The owned volume was removed and its absence verified.
Evidence: `.local-artifacts/canonical-short-evaluation/1792391606573-85750/` and
[the short-conversation record](short-conversation-evaluation.md).

This is an unreleased bounded capability, not proof that the initial semantic
selection is correct for arbitrary requests. Explicit capability-gap semantics,
first-choice relevance/explanation language and broader multi-turn evaluation
remain incomplete. Existing Ajv special-key behavior is not changed by this work.

## Optional request-dependency intent before binding questions (2026-10-19)

The earlier address-lookup stop was caused by the binding planner treating
available optional filters as unresolved dependency intent. The new composable
`selectWorkflowDraftApiBindingInputs` stage selects only the target request
pointers requested from preceding results. It receives the selected OAS request
and current/background messages, not producer response contracts, values, graph
identities or a replacement plan. Core owns description/schema/resolution in
`draft/edits/api`, `schemas` and `types`; LangChain owns this bounded model call.
The existing n8n compiler is unchanged.

A validated `inputIntent` fixes the exact targets of
`planWorkflowDraftApiCallBindings`. Both mapping and question schemas use that
set, while the model receives only the selected `bindingTargets` and their OAS
schemas instead of the entire request-field inventory. Code rejects additional
targets, missing target coverage, duplicate/overlapping selection, stale contracts
and changed receipts. Explicit human source answers revalidate the same receipt.
Empty intent makes no binding-model call; original OAS literal generation and
required-input inspection still run, without defaults or type/meaning conversion.
This does not blanket-drop optional inputs: requested optional dependencies and
explicit optional literals remain supported.

The canonical example enables the separate `api-binding-inputs` checkpoint with
`planApiBindingInputs: true`, between media selection and bindings. Results stay
in bundles and original `stageResults`, so questions do not replay selection.
The independent primitives remain callable without LangGraph. Omitting the option
or receipt deliberately preserves the earlier unscoped API, not the new guarantee.
See [the input-intent contract](workflow-draft-api-binding-questions.md#요청-의도를-먼저-고정하는-선택-단계).

Focused checks passed 32/32, including the eight new core/host cases, existing
request/binding/HITL checks and source-derived graph/document checks. They preserve
an explicitly requested optional dependency question and resume it without model
replay; missing required literals still ask; nested/array/escaped targets remain
OAS-defined. An initial host fixture omitted the explanation required by its
default plan options; it now explicitly selects the intended disabled explanation
option. The implementation schema was not relaxed. Root typecheck, lint and format
checks passed. The full root `npm test -- --test-concurrency=4` run passed
1089/1091 with no skipped/cancelled cases: the unchanged Ajv special-key case and
one previously observed local mock HTTP `ECONNRESET` failed. Both local HTTP files
passed 2/2 in isolated serial execution; its concurrency-related cause remains
unproven. No timeout, retry, exclusion or fallback was introduced.

Original-OAS integration passed 47/47. The existing ICL request-root test now
checks both scoped intent/questions and the original unscoped behavior for all
24 declared root/media combinations without modifying the source document or
calling a model/service. The independent installed consumer additionally imports
the new selector's actual public LangChain signature and executes the Core intent
receipt/scoped resolver through three fresh tarballs, strict declarations and 34
original ICL operations, with no workspace symlinks or skipped library checks.
Receipt: `.local-artifacts/packed-consumer/2026-10-19T05-57-59-700Z.json`.
The first install invocation intentionally failed before installation because the
required OAS/input paths were not supplied; existing verified fixture paths were
then explicitly configured, not substituted by product code.

Actual Chomsky evaluation used the unchanged full 188-operation inventory and
registered native candidates. Two conversations with six planned turns all
generated SDK JSON and passed isolated n8n 2.37.10/local-OAS-contract execution,
using 20 real model calls and no replay or business API calls. The first starts
with a short member request, accepts its original natural member-ID answer, adds
address lookup from the prior response, changes the initial member ID, and removes
the address call. The second adds address lookup with an explicitly supplied
`addrType: "DEFAULT"`. Both selected only `/header/custNo` for predecessor data;
unrequested address filters were absent, while the requested literal filter was
actually sent. Follow-up requests used the response member ID, different from the
initial literal. Six n8n executions made nine local requests. Owned evaluation
volume removal and absence were verified. Evidence:
`.local-artifacts/canonical-short-evaluation/1792388745981-77299/` and
`.local-artifacts/api-binding-intent-*.log`.

This is one frozen pass on known contracts, not a numeric release gate or a claim
that all optional-input policy is solved. Unknown **literal** values for explicitly
requested optional fields still need their own user-intent tracking; they cannot
be solved merely by OAS requiredness. First-stage semantic relevance also remains
model quality, not a theorem proved by source existence. One actual intent reason
was English despite Korean user messages; universal Korean explanations are not
claimed. Explicit unavailable-capability planning, broader quality, the Ajv case
and loopback reset investigation remain open. No product commit/push/publication,
new package, server, UI or mandatory host graph was added.

## Truthful host export outcomes (2026-10-19)

Core already reports an empty draft as not design-ready. The canonical host had
instead returned `phase: 'complete'` and an `exported` event without an artifact.
The host now owns an explicit Zod-validated outcome: `workflow-exported` only
after SDK JSON generation, or `no-workflow` when the adopted draft has no API or
native instances. Both identify the actual draft/revision and distinguish real
changes from `no-change`. This is an example composition contract, not a Core
restriction, a new model stage or an npm release.

Adoption enters `exporting` and clears any previous current artifact/outcome.
Successful template export copies its actual readiness flags; it does not claim
execution. Empty output keeps original unresolved requirement IDs and planning
records without inventing missing APIs, replacement work, requirements or dummy
nodes. A new user request can continue the same thread after `no-workflow`.
See [the host outcome contract](workflow-draft-conversation-host.md#output-outcomes).

The nine dedicated outcome regressions include both review policies, intentional
no-op, remove-all, new-turn recovery, runtime/deployment gaps, strict outcome
schema checks and SDK errors. A real graph checkpoint paused after adoption was
then resumed with an injected native SDK compile failure. Its phase stayed
`exporting`, the old artifact stayed absent, the error was preserved and no model
call repeated. Restoring the implementation and explicitly resuming exported the
same draft; there is no automatic retry. Existing registry-inventory tests that
deliberately return empty `no-change` now assert `no-workflow` and absence of an
artifact instead of requiring the old false `complete` status. Their feature
inventory and missing-source assertions remain intact.

The original unavailable-history case from
`.local-artifacts/canonical-short-evaluation/1792383208454-57524/` was replayed
through the current graph with all original 188 operations/native candidates.
Each of its two original Chomsky stage names, output schemas and input payloads
matched exactly before returning the unchanged recorded responses. Original plan
and final draft were identical; only the terminal host classification changed
from false completion to `no-workflow`. This is not a fresh generation success or
proof that the unavailable-capability question/gap path is complete. Evidence:
`.local-artifacts/conversation-outcomes-original-model-replay.json`.

A positive member lookup from
`.local-artifacts/canonical-short-evaluation/1792385225658-64850/` likewise used
two exact original responses and unchanged plan/API values. The SDK JSON exported
with matching revision/readiness and ran successfully in isolated n8n 2.37.10
against the original-OAS local contract server: one GET request with the original
member header. Its owned volume was removed and absence verified. Evidence:
`.local-artifacts/conversation-outcomes-exported-runtime.json` and adjacent
workflow JSON. Both replays made zero new model calls and zero business-service
calls. Existing real-OAS checks passed 47/47 separately; replayed outputs are not
new statistical samples.

Fresh verification passed 33/33 focused host/registry/documentation tests, 47/47
original-OAS checks, root typecheck, lint and formatting. The original full run
passed 1079/1082: the two obsolete empty-draft completion assertions described
above and the existing Ajv synthetic-key case failed. After updating those
assertions and adding the actual export-error checkpoint case, default-parallel
`npm test` passed 1080/1083; two local mock HTTP tests failed with `ECONNRESET`
and the unchanged Ajv case failed. The same HTTP files passed 2/2 in isolation.
The complete unchanged 1083-test suite with `--test-concurrency=4` passed
1082/1083, with only that Ajv case failing and no skipped/cancelled tests.
The cause of the default-parallel loopback resets is not established by these
reruns. No product retry, timeout change or test exclusion was added.

One focused run was invalidated by starting it while another command cleaned
shared `dist` bundles; its `ENOENT` failures remain in
`.local-artifacts/conversation-outcomes-final-focused.log`. It was not a product
fix or a successful check. The stable 33-test rerun followed the completed build
without overlapping cleanup. Other evidence uses the
`.local-artifacts/conversation-outcomes-` prefix, with bounded full regression
in `conversation-outcomes-bounded-full-test.log`.

Optional-filter investigation reached the actual earlier address-lookup stop:
its original model input had no required query fields, yet the binding proposal
requested `binding-intent` for `/query/addrType`, `/query/addrGroupNo` and
`/query/addrNo`. This was the binding stage, not the later missing-required-value
inspector. The current question schema admits any original OAS request root;
the resolver proves that each pointer exists and is unassigned, not that the
scenario needs that optional field. The host then faithfully exposes the typed
questions. This identifies the missing intent boundary; it does not justify
dropping all optional fields or silently answering a model question. No such
filter, guessed value, changed OAS requirement or name-based mapping was added.

Optional request-field intent/questions, explicit unavailable-capability planning,
broader short-turn quality and the existing Ajv synthetic-key constraint remain
open. The product has not been committed, pushed or published.

## Code-owned single-instance connections and actual short-turn continuation (2026-10-19)

Core's existing `describeWorkflowDraftConnectionEdit` now reports `not-required`
with `structuralProof: { kind: 'single-node-dag', nodeId }` for resolved implicit
connection work with exactly one independent instance, no retained edges, a single
main input and no join or data/control dependencies. Explicit `revise-connections`
intent is excluded: it still reaches the ordinary model/question path. Multiple
nodes, retained incident edges, missing results, repairs and unresolved decisions
are not simplified. The proof/fingerprint comes from actual staged contracts, not
field names, a prompt instruction or a corrected model response. Direct LangChain
and the canonical host already use this description, so neither needs a new
single-node orchestration implementation or a fake keep-connections response.

Atomic assembly now returns the unchanged draft/revision when all required work
has resolved and the actual change list is empty. The duplicate special case in
the model connection resolver was removed; the non-empty mutation API stays
strict. Canonical candidate review and re-derivation at adoption remain unchanged.
Focused connection/assembly/host checks passed 59/59. Existing call-count fixtures
were updated to assert the connection model is absent, retaining their value,
question, review and SDK assertions. Initial fixture mistakes (no deployment URL
and trying to create an already-invalid standalone join) were preserved, not used
to relax runtime contracts.

The original 188-operation OAS/full-native four-conversation evaluation made 33
actual Chomsky calls. Of 12 planned turns, 10 were reached: 8 passed isolated n8n,
1 stopped for expected unavailable-work clarification, and 1 failed the verifier's
literal-shape assertion. A short member request plus its original natural reply
now passed with three model calls and no connection call. Newsletter add/change/
cancel and both services' native collection/assertion/addition/removal passed;
the native positive/negative response variants also ran. This run is preserved at
`.local-artifacts/canonical-short-evaluation/1792385225658-64850/`.

The verifier failure compared `query: {}` with absent query literals before
execution. Recompiling the unchanged actual draft against all original operations
and running it showed two correct requests, no query fields, and the address
request using the prior response member ID rather than the initial literal.
The evaluation-only comparator now treats empty named path/query/header/cookie
maps as no supplied parameter fields. It does not alter data or ignore body
presence, querystring, nested empty values, null/false/zero or type differences.
Its three regression cases passed. Original failed reports were not overwritten.
The direct replay is `.local-artifacts/single-node-connections-address-replay.json`.

A proposed response replay returned six original stages, then correctly stopped
at the seventh schema check: a fresh approval UUID changed the base-draft hash and
new node ID. No ID substitution or rebase was added. That attempted replay made
zero actual model calls and remains at
`.local-artifacts/canonical-short-evaluation/1792385554350-66315/`. Instead, the
original adopted draft and transcript seeded the documented completed-draft
conversation entry point. Its two previously unreached member-ID-change/address-
cancel turns passed with four new model calls and actual n8n executions, at
`.local-artifacts/canonical-short-evaluation/1792385692187-66624/`. This is a separate
saved-draft continuation, not a fresh complete 12-turn pass or a statistical
quality claim. All runs used only the local contract server; owned volumes were
removed and absence verified.

Original OAS checks passed 47/47. A fresh three-tarball strict TypeScript/runtime
consumer passed with 34 ICL operations, without workspace symlinks or skipped
declaration checks; receipt:
`.local-artifacts/packed-consumer/2026-10-19T04-47-34-680Z.json`. Current verification
logs use `.local-artifacts/single-node-connections-`. Final clean-build regression
passed 1073/1074 with zero skipped/cancelled tests; only the unchanged Ajv synthetic
key test failed. Type checks, lint, formatting and graph/document checks passed.
Earlier regression logs retain two obsolete connection-call counts and the
initial broad proof version; the final focused cases retain explicit routing
intent and now assert the omitted model call where it is actually unnecessary.
The same source-derived
29-node/66-route graph marks this connection work. Optional-input questioning,
the still-reachable empty no-change export and broader quality evaluation remain
open. No product commit, push, publication, server or UI was added.

## Graph-proven singleton API responses in native checks (2026-10-19)

The preserved actual-model workflow reproduced its normal-data failure: both API
requests and Merge append succeeded, then the linked native assertion failed.
Each appended item retains only its own branch ancestry. Reading every independent
API with `itemMatching(inputIndex)` therefore does not supply both responses.

`findSingletonApiResponses` now proves at-most-one output only from a single
Manual Trigger item and actual API fragments declaring `preservesInputItems`:
API roots and single-edge API-only continuations. Unknown native streams, expansion,
multi-input paths and undeclared starts are not positive evidence. The compiler
passes those facts to native response checks. A proven source must have exactly
one actual result; zero/multiple results fail. Unproven sources keep ancestry reads.
There is no failed-read recovery, first-item guess, positional zip, output repair,
new model decision, or changed OAS/data. IF guards and comparison expressions share
the same reader policy. This implementation does not claim arbitrary native-stream
cardinality analysis or change every HTTP-request binding reader.

The original Chomsky draft/messages were recompiled against all 188 original OAS
operations and the registered native inventory, without regenerating or editing
the plan. The same normal-data workflow succeeded in isolated n8n 2.37.10; changing
only the local member response code to -7 failed with the original model assertion
message. Additional model calls were zero; this is a replay, not another fresh
generation success. Original and replay evidence are under
`.local-artifacts/native-collection-failure-replay.json` and
`.local-artifacts/native-singleton-real-model-*`.

A durable public-API fixture and `test:native-singleton-responses-local-n8n` verify
four actual assertion/IF positive/negative executions. The existing nested-array
runtime verified eight normal/filter/empty/invalid cases. Focused source-policy
tests passed 4/4, original OAS checks 47/47 and an independent three-tarball strict
TypeScript/runtime consumer passed with 34 original ICL operations. Full regression
at this checkpoint is 1064/1065, with only the unchanged Ajv synthetic-key failure;
no tests are skipped/cancelled. Type checks, lint and formatting passed. The new
IF test initially supplied an assertion-only message field; that fixture error is
preserved in the first focused log and the original strict schema was retained.
Logs use the `.local-artifacts/native-singleton-` prefix; installation receipt is
`.local-artifacts/packed-consumer/2026-10-19T04-30-05-027Z.json`.

The same graph document is refreshed; topology remains 29 nodes and 66 registered
routes. Unnecessary connection/optional-input questions and the empty unavailable
work outcome remain open. The complete frozen multi-turn evaluation has not been
rerun with new model calls after this fix. Product changes remain uncommitted and
unpublished; this is not completion of the OSS or a UI implementation.

## Source-backed graph visualization and native reference eligibility checkpoint (2026-10-19)

The user requested a graph that stays current after each implementation task.
`npm run graph:update` rebuilds the current source and generates
[the same Korean graph document](current-conversation-graph.md) from the actual
compiled `createWorkflowDraftConversationGraph().getGraphAsync()` result. The
stage summary is a projection of those actual routes, not an independently
maintained execution graph. Full node IDs/labels/routes and a deterministic
topology digest are included. The process makes no model/business calls and
starts no server or watcher. Repository instructions now require refreshing this
same document and showing its current summary after each task.

Initial inspection returned 29 nodes and 340 drawing edges because conditional
destinations had not been declared, so LangGraph conservatively drew every
possible destination. Existing route functions now declare their exact endpoint
maps. Work-kind schema options own the scheduler target inventory and its type.
The real graph now contains 29 nodes (including start/end) and 66 registered routes.
Tests verify representative exact destinations, scheduler coverage, complete
Korean labels and document/source identity. Existing conversation behavior and
interrupt/review paths remain covered by the full regression.

Native producer eligibility is also implemented at this checkpoint. Every
registered native implementation declares `parameterReferenceSources`: API
responses, native JSON output, exclusive control, or an explicit empty list.
Both standalone and canonical producer-choice stages intersect those declarations
with actual source kinds. Merge receives no parameter-source candidates, response
assertions receive only API responses, and potential future native outputs/control
come only from implementation declarations, never invented ready schemas. Missing
or invalid extension declarations fail before this optional planning stage;
legacy paths not using it are not forced to declare the new protocol. Material
binding preserves the declaration, actual reference kinds are checked, and exact
chosen/used producer equality remains enforced. No-choice planning uses zero model
calls even with unrelated available API/native materials. Empty source arrays use
the ordinary string-array/maxItems=0 contract rather than an impossible item schema.

Source-choice rows with no possible decision do not request model reasons. Test
fixtures now reflect that wire contract; the cycle fixture creates a real cycle
between two reference-capable roles instead of attaching a nonexistent reference
to a literal-only producer. A separate test retains rejection of an unused
supported producer. New fixture setup failures (missing evidence/undeclared private
test import) are preserved separately from product behavior.

Graph/source, documentation and eligibility checks passed 8/8. Existing standalone
and canonical producer/host paths passed in the subsequent full clean-build run:
1060/1061, with no skipped/cancelled tests and only the unchanged Ajv synthetic-key
failure. Type checks, lint, formatting and graph-document checks passed. Logs are
under `.local-artifacts/conversation-graph-` and the initial narrower native run is
`.local-artifacts/native-reference-eligibility-focused-first.log`.

The subsequent actual model/n8n replay has now ended, but it did not pass fully.
With the same 188 operations and full native inventory, 29 model calls reached
8 of 12 planned turns: 5 passed, 1 paused for another input question, 2 failed,
and 4 were not reached. Native collection/assertion planning reached final review,
but its normal-data n8n execution returned an error; the runtime cause is not yet
established. The absent-history API case again failed the explicit unresolved-work
outcome check. Business API calls were zero and owned volume absence was verified.
The graph annotation reflects these observations, not a completion claim. See
[the preserved evaluation record](short-conversation-evaluation.md). Unnecessary
optional-filter questions and empty no-change handling also remain open.

## Code-owned answer sources and broader actual conversation replay (2026-10-19)

Core now exposes `describeApiInputSources`, `createApiInputSourceSelectionSchema`
and `resolveApiInputSourceSelections`. The answer model selects complete JSON
candidate IDs or inclusive unquoted text-boundary IDs; it no longer emits
`sourceText`, `sourceFormat` or a duplicate value. Source text and representation
are resolved from the captured original reply before the unchanged literal/OAS
validation and explanation receipt are constructed. The low-level explicit source
API and returned `analysis.sources` retain their existing shape.

Quoted tokens are never offered as inner text boundaries. Numeric-like runs are
indivisible, including malformed numeric forms. Unquoted strings, spaces, Unicode
codepoints, actual JSON scalars and complete nested containers remain supported.
The shared lexical scanner retains the earlier numeric protection and also checks
JSON keyword boundaries before prose punctuation. Candidate parsing accepts only
error-free syntax and finite numbers; it does not adopt parser recovery, convert
types, repair data or infer field mappings. No available source means no model
call and no fabricated model explanation. Unknown/reversed/cross-quoted text
boundaries fail. Caller mutation during the await still cannot replace the original
reply or pending contracts.

Focused extraction, HTTP, lexical, source-choice and both host checks passed 42/42.
The earlier scalar fixture was updated to select offered IDs, retaining the same
typed values and rejection checks. Final full regression passed 1053/1054, with
no skipped/cancelled cases and only the unchanged Ajv synthetic key failure.
Original OAS checks passed 47/47. A first OAS command omitted its required explicit
directory and failed before tests; the correctly configured command is preserved
separately. Typecheck, lint and formatting passed. Fresh independent consumer
`.local-artifacts/packed-consumer/2026-10-19T03-47-26-910Z.json` imports and exercises
the public source-choice APIs from three tarballs, with strict declarations,
34 original ICL candidates, no workspace symlinks and no model/business calls.

The unchanged four-case actual evaluation reached nine of twelve planned turns
using 28 Chomsky calls. Six generated SDK JSONs passed isolated n8n 2.37.10/local
contract execution, including the previously failing quoted member input reply.
The lookup/newsletter body add/change/cancel conversation passed all four turns.
One address-addition turn asked unnecessary questions about unspecified optional
filters despite correctly binding the response member ID. Native Merge producer
mismatch still failed the existing reference validator. The unavailable-history
case correctly selected no substitute API but ended as an empty `no-change`
completion rather than an explicit question/gap result, failing the original
negative oracle. These are one additional pause, two failures and three unreached
turns, not overall success. The owned volume was removed and absence verified;
business service calls were zero. Original outputs and execution JSONs remain at
`.local-artifacts/canonical-short-evaluation/1792381347262-52087/`.

See [the report](short-conversation-evaluation.md) and
[source-choice contract](api-input-answer-extraction.md). Logs use the
`.local-artifacts/input-source-choice-` prefix. Native implementation-owned
reference eligibility, optional-input intent and explicit no-result/gap handling
remain open; no complete-product, server/UI, product commit or publication claim
is made.

## Multi-source wire sharing and short-conversation findings (2026-10-19)

The new private evaluation supplied all 188 operations from two unchanged OAS
documents and all registered native definitions to the canonical conversation
host. Initial semantic and clarification calls were rejected with enum counts
1003/1185, despite only 188 actual candidates. Model-owned semantic/evidence schemas
now explicitly use official Zod `reused: 'ref'` serialization. Strict mode, candidate
membership, source ownership and original OAS remain unchanged. Shared-definition
policy is explicit at those schema owners, not a provider-error fallback.

A global reuse change was tested but not retained: Zod-generated definitions
overwrote an existing OAS-owned `$defs` in a minimal reproduction. Value-contract
serialization keeps its original scope. Independently annotated requirement text
fields now use one validation factory with distinct schema identities. This avoids
exporter-created draft-7 `allOf` while retaining original nonblank validation and
descriptions. No unsupported keyword is removed after generation. Tests inspect
references as references and still compile/validate the unmodified wire document;
the historical inherited-metadata reproduction remains separate.

Actual post-fix evaluation observed eight of twelve planned turns: five executable
turns passed isolated n8n, one missing-operation case paused with a real structured
question and no API, and two plans were rejected. Four downstream turns were not
reached. The two unresolved failures are quoted answer text selected without its
literal delimiters, and Merge execution predecessors incorrectly selected as
setting references. Both were rejected by existing validators, not repaired or
executed. The native producer-stage input still lacks an implementation-owned
reference-location contract; future selection must reflect that actual contract.
No general success rate or release threshold is inferred.

Current actual model calls were 24. Earlier development runs retained four enum
rejections and fourteen calls with an evaluation-server defect plus the later
`allOf` rejection. Across these runs there were 42 actual model calls, not 42
successful tasks. The evaluation server was corrected to use the actual effective
parameter list; it never contacted business services. The final owned Docker volume
was removed and its absence verified. Exact original states and JSON are at
`.local-artifacts/canonical-short-evaluation/1792380157343-47387/`.
See [the detailed report](short-conversation-evaluation.md) for original runs,
oracle scope, failures and unchanged queries. Full checks are recorded below.

## Canonical native producer choices and structural removal checkpoint (2026-10-19)

The canonical `createWorkflowDraftConversationGraph` now opts into
`planNativeDependencies: true`. A separate `native-dependencies` checkpoint uses
the original draft edit plan's code-allocated **new** native IDs, actual base
sources and selected API response declarations. It never fabricates a standalone
selection receipt, future native output schema, parameter ownership or execution
edge. Existing node revisions remain separate scoped edit/repair stages; their
unfinished outputs are not reused as ready source contracts.

Core exposes `describeWorkflowDraftNativeDependencies`,
`createWorkflowDraftNativeDependenciesSchema`,
`resolveWorkflowDraftNativeDependencies` and
`validateWorkflowDraftNativeDependencies`. The strict producer-choice schema and
new-role cycle validator are shared with standalone selection. LangChain's
`planWorkflowDraftNativeDependencies` makes zero calls when no choices exist,
otherwise one. Only IDs and optional short grounded reasons are returned.
The immutable receipt binds the original edit plan/source context, not accumulated
configuration results. A later turn or explicit user revision supersedes it;
review resume and a failed value-stage retry do not regenerate it.

Readiness waits for the chosen actual producer, even if an unrelated output would
satisfy a constructor's material count. Ownership/value schemas and model-visible
source inventories contain only chosen actual contracts; an explicit empty choice
stays empty. Original selected role identities/instructions are input-only context
so a single-role setting call need not re-decide the whole request. Core validates
actual references, and `assembleWorkflowDraftEdit` rechecks supplied completed
resolutions. Approval binds the producer receipt; stale/tampered choices cannot
be adopted even with a newly issued review token. Pending producer questions are
not duplicated as downstream missing-input questions. API response declarations
remain usable before request parameters are complete, without claiming execution
readiness or creating an implicit route.

Actual-model attempt one made five calls and stopped with an unnecessary question:
the final child configuration asked whether two split roles were needed, although
the semantic and producer stages had already selected them. The original output
remains at `.local-artifacts/draft-native-dependencies-live/1792378199277-40697/`.
The value-stage input lacked the selected role identities and sibling task scopes;
it now receives those original code-bound roles and its own node/step IDs. No
question was suppressed or generated parameters repaired.

Attempt two generated the correct workflow, but its subsequent removal turn asked
whether to reconnect a removed terminal node. All eight calls are retained at
`.local-artifacts/draft-native-dependencies-live/1792378353189-41396/`.
`resolveWorkflowDraftTerminalRemoval` now proves a code-only deletion when a turn
only removes a terminal subgraph, no surviving downstream consumer remains and
no material/requirement work is pending. It derives only incident edge removals,
never new routes/values. The host exposes `structuralConnectionResult` separately
from actual model connection proposals, binds it to review and recomputes it at
adoption. Middle-node removal and low-level explicit change/delta APIs keep their
existing contracts. Remaining model connection inputs also retain affected
decision node IDs instead of discarding them.

The final actual Chomsky run at
`.local-artifacts/draft-native-dependencies-live/1792378672733-42387/` used seven
calls: six for generation and one semantic removal call. No producer/value/connection
model call was needed for that terminal removal. Both original SDK JSON and its
follow-up JSON passed isolated n8n 2.37.10 execution, preserving `0`, `false`, the
expression-looking string and `3`, then the two original group objects after child
removal. The unrelated existing node and surviving settings remained unchanged.
Business/local API calls were zero. The owned Docker volume was removed and its
absence verified. Across all three attempts there were twenty actual model calls,
not twenty successful scenarios. This is one native-only multi-turn case, not an
OAS operation-selection or general short-query reliability benchmark.

Focused checks passed 92/92 and original private OAS checks 47/47, including existing
direct connection/edit contracts. Typecheck, lint, formatting, documentation links
and whitespace checks passed at this checkpoint. The independent three-tarball
consumer exercises the new strict public producer and terminal-removal APIs with
no workspace symlinks, skipped declarations, model calls or business calls.
Fresh consumer receipt:
`.local-artifacts/packed-consumer/2026-10-19T03-02-05-477Z.json` (34 original ICL
candidates). An initial full regression exposed that input-only role IDs were
also being sent on the old non-opted-in value path. They are now included only
with the producer-choice context; the original HTTP input contract remains intact.
The original two-failure run is retained at
`.local-artifacts/draft-native-dependencies-regression.log`. The unchanged old-path
HTTP check and documentation checks passed 2/2. Current-code replay of all seven
actual model results confirmed identical wire schemas/inputs and both executed
SDK workflows, with zero new model calls:
`.local-artifacts/draft-native-dependencies-actual-replay.log`.
Final clean-build regression passed 1044/1045, with no skipped/cancelled tests and
only the unchanged Ajv synthetic key failure. Final logs:
`.local-artifacts/draft-native-dependencies-regression-final.log`,
`.local-artifacts/draft-native-dependencies-typecheck-final-verified.log`,
`.local-artifacts/draft-native-dependencies-lint-final-verified.log`,
`.local-artifacts/draft-native-dependencies-format-final-verified.log`,
`.local-artifacts/draft-native-dependencies-real-oas-verified.log`,
and `.local-artifacts/draft-native-dependencies-focused-final-all.log`.

Use [the canonical opt-in guide](workflow-draft-conversation-host.md#optional-producer-choices-for-new-native-roles)
and [the structural removal guide](workflow-draft-conversation-host.md#code-owned-terminal-removal).
All additions remain unreleased. Broad conversational evaluation and the known
Ajv synthetic key failure remain open; no server, UI, product commit/push or npm
publication was added.

## Explicit native producer-choice checkpoint (2026-10-19)

Core now exposes a separate producer-choice contract after native role selection:
`describeNativeInstanceDependencies`, `createNativeInstanceDependenciesSchema`,
`resolveNativeInstanceDependencies` and `validateNativeInstanceDependencies`.
`planNativeInstanceDependencies` is the optional LangChain wrapper. Code owns row
keys, candidate identities, material capture and receipt hashes. The model chooses
only source IDs and optional short reasons; it cannot generate values, output
schemas, ports or execution edges in this stage. No available choices means zero
model calls. The reasons are declared explanations, not proof of semantic accuracy.

The two existing staged generation factories register `planNativeDependencies`
when `nativePlanning.planDependencies: true`. The original choice is persisted in
`nativeDependencies`. Missing/foreign rows, unknown/self/duplicate IDs and cycles
are rejected. A reverse-selected C/B/A chain is configured A/B/C, even with an
unrelated already-completed producer present. Each value stage sees only the
explicitly selected actual sources. Empty producer choices do not expose the
inventory. Actual API/native/control reference IDs must exactly equal the choice;
the same check applies to supplied completed consumers, including schema-identical
producer substitutions. Final execution edges still come from connection planning
and the existing topology validator, not this readiness graph.

Both host examples passed original-question HITL resume without repeating role or
producer selection. A cyclic plan fails before values; an explicit host retry
repeats only the dependency stage. Stale/tampered receipts, changed source material,
old question fingerprints and concurrent mutations fail without rebase or hidden
retries. The canonical completed-draft conversation host is still a separate
composition; this work does not claim its new dependency-stage integration.

Actual Chomsky used six calls at
`.local-artifacts/native-instance-dependencies-live/1792376444214-33362/`:
role selection, producer selection, three configurations and connections. The
generated three-role native-only SDK workflow passed isolated n8n 2.37.10 with
two nested splits, retaining `0`, `false`, an expression-looking string and `3`.
Two explicit post-compilation fixtures checked an empty group array and rejection
of a null child before splitting. Those fixtures are not extra model generations.
Business/local API calls were zero; the owned Docker volume was removed and its
absence verified. After tightening the completed-consumer boundary, all three
original actual-model configuration results were revalidated against current code
and the rebuilt SDK JSON was exactly equal to the executed JSON, with zero new
model calls. Receipt: `.local-artifacts/native-instance-dependencies-actual-replay.log`.
This is one successful semantic case, not general selection-quality evidence.

Focused checks passed 94/94 and original OAS checks 47/47. A freshly installed
three-tarball consumer passed strict TypeScript and runtime checks of the new
public contracts, with 34 original ICL candidates and no workspace symlink or
skipped declaration checks. Receipt:
`.local-artifacts/packed-consumer/2026-10-19T02-23-29-148Z.json`.
Fresh lint found bare `structuredClone` uses in the new tests and one late-edited
previous regression test. They now explicitly use `globalThis.structuredClone`;
no lint rule was relaxed. The previous final-lint report did not cover that late
test edit. Current typecheck/lint/format, documentation links and whitespace checks
passed. The clean-build full regression passed 1032/1033, with no skips or
cancellations and only the unchanged Ajv synthetic key failure. Logs:
`.local-artifacts/native-instance-dependencies-focused-final.log`,
`.local-artifacts/native-instance-dependencies-real-oas.log`, and
`.local-artifacts/native-instance-dependencies-regression.log`.

Use [the explicit-producer guide](native-runtime-inputs.md#explicit-producer-dependencies)
and [the example option](../examples/langgraph-workflow/README.md#기존-생성-factory의-단계별-native-계획).
New types, schema, prompt, deterministic resolution and model invocation stay in
their owning folders. The complete OSS goal, canonical-flow integration and broad
short-query evaluation remain open; no server, UI, product commit/push or npm
publication was added.

## Source-bound native configuration checkpoint (2026-10-19)

Independent native configuration now keeps the original selection receipt intact
and binds its value schema from actual supplied API contracts and completed native
outputs. The narrowed source-ID enum excludes unfinished selected roles and invented
producers. Original Zod validation, pointer/output contract checks, immutable per-task
source snapshots and question fingerprints remain authoritative. Final node plans,
prepared-source capture and planning records use the existing dependency-resolving
material snapshot instead of invoking unbound implementation placeholders.

`inspectNativeNodeConfigurationReadiness` reports actual constructor prerequisites.
The two existing staged hosts defer instances missing those contracts, configure
independent producers and resume consumers after the actual output exists. They
reconstruct bound SDK implementations before API binding, connection planning and
export; executable callbacks are not placed in checkpoints.
`resolveN8nNativeMaterials` is now a public adapter boundary with strict public types.
Existing static API-reference diagnostics still run before material resolution.

This is constructor scheduling, not arbitrary semantic dependency planning. If an
unrelated output is available but the intended producer has not been chosen/configured,
the library cannot infer the intended producer from matching fields or array order.
An old question's source bundle is not silently expanded. Explicit semantic producer
selection/dependency planning remains required for those cases.

The actual Chomsky run at
`.local-artifacts/native-configuration-materials-live/1792375070212-29838/`
used four calls: role selection, producer values, consumer references and connections.
The generated native-only SDK JSON passed isolated n8n 2.37.10 execution with integer
`0`, boolean `false` and the unchanged expression-looking string. Two additional,
explicit post-compilation fixtures checked an empty array (no child items) and
an invalid null element (rejected before Split Out). They are not extra model
generation successes. Business/local API calls were zero. The owned Docker volume
was removed and its absence verified. This does not prove OAS selection quality or
general model reliability.

Focused checks passed 84/84, original private OAS checks 47/47, and a new independent
three-tarball consumer passed strict TypeScript and runtime checks with 34 original
ICL candidates, no workspace symlink and no skipped declaration checks. Receipt:
`.local-artifacts/packed-consumer/2026-10-19T01-58-56-596Z.json`.
An earlier full run preserved two diagnostic-contract failures and two unchanged
localhost HTTP `ECONNRESET` failures in addition to the known Ajv test. The diagnostic
ordering was corrected; unchanged HTTP rechecks passed. No retries, timeout changes,
test exclusions, schema compatibility rewrite or missing-source substitution were
introduced. The final clean-build full regression passed 1020/1021 with no skips
or cancellations; only the unchanged Ajv synthetic key case failed. Both the named
API diagnostics and unchanged HTTP tests passed in this full run. Logs:
`.local-artifacts/native-configuration-materials-focused-verified.log`,
`.local-artifacts/native-configuration-materials-real-oas.log`,
`.local-artifacts/native-configuration-materials-regression.log` (earlier failure),
and `.local-artifacts/native-configuration-materials-regression-final.log`.
Workspace typecheck, lint, formatting, documentation links and whitespace checks
also passed. The failing Ajv case was neither skipped nor rewritten.

Use [the staged configuration guide](native-runtime-inputs.md#staged-native-planning-in-existing-hosts)
and [the two example factories](../examples/langgraph-workflow/README.md#기존-생성-factory의-단계별-native-계획).
The complete OSS goal remains open; no product commit/push or npm publication occurred.

## Existing host staged-native checkpoint (2026-10-19)

The orchestrated and conversational generation factories now opt into
`nativePlanning: { mode: 'staged', allowRuntimeParameters? }`. Explicit host
persistence is required; runtime ownership also requires an explicit input
revision. Omission retains compact planning. Flat checkpointed nodes select roles,
schedule/configure actual instances, defer questions while independent settings
continue, and revalidate all receipts before API bindings/connections/SDK export.
The injected capability implementations are not serialized into the checkpoint.

Original selection and per-question configured-source snapshots stay unchanged
across replies. Unknown/blank/foreign-thread answers ask again without a model
call; distinct roles of the same capability have distinct questions/slots and can
be answered in either order. Explicit retry resumes only the failed value node.
Cancellation exports nothing. Known settings do not force a question, and
proven-empty/runtime-owned settings make zero value-model calls. Existing API
binding stages consume these actual native output contracts and SDK producer names.

The first live attempt returned the correct user setting but connection planning
reopened the original scenario's already answered message question. Its original
false gap and four calls remain at
`.local-artifacts/staged-native-host-live/1792361365063-21255/`; no n8n execution
or response repair occurred. Connection materials now validate partial nodes'
remaining literal requirements using the same ownership projection as generation,
then derive `nativeParameterReadiness` in code. Slot inspection may allow an
unfinished configuration; final connection inputs cannot call it ready. The
model sees validated plan-time settings separately from explicit execution input
pointers and cannot generate/change that metadata. General semantic correctness
is still not guaranteed by this context improvement.

The same-scenario actual Chomsky run at
`.local-artifacts/staged-native-host-live/1792373036801-24898/` passed with role
selection once, value generation twice and connection planning once. The original
selection remained unchanged; independent empty settings completed before the
reply. Native-only SDK JSON passed two isolated n8n 2.37.10 checks: missing runtime
input stopped at preflight, and supplied integer `0` plus the exact expression-like
answer string were preserved. Both native roots stayed independent. No business
or local API was called. Across both development runs there were eight actual
model calls, not eight successful semantic outcomes. This is not an OAS operation
selection or general provider-quality benchmark.

Focused checks passed 54/54; actual private OAS checks passed 47/47. The resumed
clean full regression passed 1007/1008 with no skips/cancellations and only the
unchanged Ajv synthetic key failure. An earlier full run additionally recorded two
localhost HTTP `ECONNRESET` failures after unusually long elapsed time. Their
precise cause was not established; unchanged standalone rechecks passed 2/2 and
the resumed full run did not reproduce them. Original failed logs remain intact.
Logs: `.local-artifacts/staged-native-host-final-focused.log`,
`.local-artifacts/staged-native-host-final-real-oas.log`,
`.local-artifacts/staged-native-host-final-regression.log`,
`.local-artifacts/staged-native-host-http-recheck.log` and
`.local-artifacts/staged-native-host-resumed-regression.log`.

Workspace typecheck, lint, format, whitespace and documentation links passed.
The latest independently installed three-tarball strict consumer also passed
against all 34 original ICL operations, with no workspace symlinks or skipped
library checks. It validates the shared public native-input configuration schema
as well as compilation. Receipt:
`.local-artifacts/packed-consumer/2026-10-19T01-27-49-944Z.json`.

The example README and native-input guide describe this explicit option and its
records. Arbitrary source-dependent configuration scheduling, broad model quality
and the existing unapproved Ajv compatibility workaround remain open. Completed-plan
edits still use the separate canonical draft host. No product commit/push, npm
publication, UI, server or database was added; the full goal is not complete.

## Standalone native input compilation checkpoint (2026-10-19)

Strict, reviewable and finite-batch REST compilers now accept explicit
`nativeInputs: { revision, inputValues? }`. They share slot inspection, original
full-schema preflight, actual SDK guard mapping, value setup and Korean guidance
with canonical templates. No synthetic canonical draft or revision is invented.
`createN8nNativeOutputSources` accepts the same configuration before API fragments
are built from the actual native producer exits. Results with slots expose
`nativeInputTemplate`; literal-only plans retain their existing result shape.

Runtime-capability protocol capture preserves private prototype methods. A fresh
material-bound implementation retains its explicit compiler input context, while
existing structural/reference validation remains unchanged. Complete plans keep
their DAG, and review gaps retain warning regions and internal edges with only
Start detached. Batch scopes still use their original finite-scope validation
and SDK lowering; they are not silently replaced by ordinary DAGs.

Focused compilation/input/review checks passed 60/60, including 14 new compiler
checks. Root typecheck, lint, format, whitespace and documentation links passed.
Fresh full regression passed 993/994 with no skips/cancellations and only the
unchanged Ajv synthetic key failure. Original private OAS checks passed 47/47.
Logs: `.local-artifacts/native-input-compiler-regression.log` and
`.local-artifacts/native-input-compiler-real-oas.log`.

The actual isolated n8n 2.37.10 runner passed 22 assertions: seven normal
executions and fifteen expected rejections. Twelve assertions use standalone
strict/reviewable compilation with whole/partial inputs and valid/missing/wrong
values. Missing/wrong inputs stop both those paths before any request; valid
values preserve the complete original JSON across native Set, echo API, independent
health API and Merge. The changed-after-preflight canonical case blocks echo but
allows one independent health call, and is not reported as zero total calls.
The run made fifteen local requests, zero business calls and zero model calls.
Artifacts: `.local-artifacts/native-runtime-inputs/1792360081465-18364/`.
Its `reviewable-gap.json` additionally preserves the detached Start and Korean
warning region; that gap JSON was not executed. The owned Docker volume was
removed after verification.

The independently installed three-tarball strict consumer passed the new
`strictNativeRuntimeCompilation` contract with all 34 original ICL operations
available, no workspace symlinks and no skipped library declaration checks.
Receipt: `.local-artifacts/packed-consumer/2026-10-18T21-49-34-151Z.json`.
Two earlier consumer typechecks failed because the new fixture dereferenced a
nullable SDK connection list. The fixture now explicitly checks both that list
and its edge; no public type, compiler check or TypeScript option was weakened.
Both failed receipts remain preserved.

This closes the common SDK prerequisite, not the older factory's staged/HITL
integration or general model quality. Those factories still use the compact
native planner. No actual model was invoked for this deterministic compiler
checkpoint, and no product commit/push, npm publication, UI or server was added.
The full goal and the known unapproved Ajv compatibility workaround remain open.

## Native configuration reply checkpoint (2026-10-19)

The independent value stage now accepts ordered `replies: [{ question, text }]`
without replacing the original scenario or selection. Core derives each question
ID from its instance, source fingerprint and original proposal, then validates
every answer's scope and position before invocation. Changed question content/IDs,
other targets, stale material, duplicate/reordered rounds and earlier answer edits
followed by old questions fail. Empty/invalid text is not substituted. Question
hashes check supplied-record consistency, not human/model authenticity.

The role-selection contract now declares `parameterPlanning` with a separate
value/clarification stage. A missing plan-time literal is not a missing native
capability, and it is not silently converted into execution-time ownership. The
model receives typed setting choices and validated reply data; no IDs, schemas,
ownership or connections are added to its generated decision.

An initial real-model run wrongly returned a capability gap for an unspecified
plan-time message. The diagnostic graph then dereferenced an empty instance list
and stopped with TypeError. Its original gap and failure are preserved at
`.local-artifacts/native-configuration-replies/1792357560717-13019/`. Selection
materials/field descriptions now explicitly separate supported roles from missing
literal values, and the diagnostic graph checks the selection before configuring
it. No model response was repaired or silently retried.

The final same-scenario run used actual LangGraph MemorySaver and interrupt/resume:
one Chomsky role call, one question call, and one value call after the user's
natural-language answer. The selection remained byte-for-byte JSON-equal across
resume. Official SDK JSON passed two isolated n8n 2.37.10 assertions: the answer's
expression-looking text and numeric runtime value `0` were preserved; missing
runtime input stopped at global preflight. Business API calls were zero. Evidence:
`.local-artifacts/native-configuration-replies/1792357791276-13487/`.
Across both development runs there were four actual model calls, not four
successful semantic outcomes. Focused standalone/wire/HITL checks passed 21/21.

Final checks passed workspace typecheck, lint, format, whitespace and documentation
links. The clean full regression passed 979/980 with no skips/cancellations; only
the unchanged Ajv synthetic key case failed. Original private OAS checks passed
47/47. The independent three-tarball strict TypeScript/runtime consumer passed
`nativeConfigurationReplies` with no workspace symlink or skipped declaration
checks. Logs: `.local-artifacts/native-configuration-replies-full-regression.log`,
`.local-artifacts/native-replies-real-oas.log`; consumer receipt:
`.local-artifacts/packed-consumer/2026-10-18T21-13-10-671Z.json`.

The host-integration audit remains distinct from this completed OSS contract.
`createOrchestratedWorkflowGenerationGraph` and the older conversational factory
still register the compact `planNativeNodes` stage. Its `nativeOptions` exposes
only explanation control, and review compilation does not supply the template
input source/revision required by native runtime guards. These factories were not
silently redirected or given a flag their compiler cannot honor. Their explicit
staged checkpoint/template composition remains next work. The canonical draft
conversation's separate native addition/edit stages retain their existing path.

No source files, server, UI, database, product commit/push or publication were
added for this checkpoint. General semantic/provider quality and the existing
unapproved Ajv workaround remain open; this is not overall OSS completion.

## Standalone native role/value checkpoint (2026-10-19)

Independent hosts now have `selectNativeNodeInstances` and
`generateNativeNodeParameters`, each performing at most one model invocation.
Selection contains only capability, distinct scenario role and explicit
literal/whole-object/field ownership. Core derives role-scoped IDs and the actual
remaining-value schema. Runtime-owned fields are excluded from value choices;
whole-owned, fully field-owned and proven empty settings make no value call.
The shared native generation contract also serves draft additions, without a
synthetic draft, fake parameters, invented edges or a second hidden model call.

`resolveNativeInstanceSelection`, `describeNativeNodeConfiguration` and
`resolveNativeNodeParameters` expose the pure boundaries. Completed source nodes
are supplied explicitly and validated; unfinished selected roles receive no
fabricated output contract. Saved selections and source fingerprints are checked
against their original material, not automatically rebased. The actual LangGraph
MemorySaver regression resumes a failed parameter call without repeating the
completed selection. Existing compact `planNativeNodes` remains a single-call
literal/whole-object API; it is not silently redirected to this staged composition.
Material-dependent capability constructors still require actual source contracts.

Two distinct real-model development failures are preserved. The first selection
reported a gap because its HumanMessage capability material still listed only
literal/whole-object ownership while the wire schema offered fields. Context and
schema now share the same source factory. The second selected fields correctly
but asked for a prepared/output instance of the very target being created.
Parameter generation now sends the actual selected implementation description
and distinguishes the new target from upstream producer sources. No response was
patched, discarded, or retried inside the library.

The final same-scenario run made two Chomsky calls and compiled the unchanged
result with the official SDK. Three isolated n8n 2.37.10 assertions passed: valid
input retained `false`, numeric `0` and expression-looking literal text; missing
input and wrong type stopped at global preflight. There were zero business API
calls. Across all three development runs there were five actual model calls,
including the two unsuccessful semantic outcomes, not five successes.

Evidence:

- Standalone/actual-wire focused checks: 15/15, including actual LangGraph
  checkpoint resume and source/ownership boundary rejection.
- First selection failure: `.local-artifacts/native-instance-stages/1792356064072-9128/`.
- Question outcome: `.local-artifacts/native-instance-stages/1792356286571-9982/`.
- Final model/SDK/n8n evidence: `.local-artifacts/native-instance-stages/1792356473423-10515/`.
- Clean full regression: 973/974, no skipped/cancelled cases; only the known Ajv
  synthetic key failure. Log: `.local-artifacts/native-instance-stages-full-regression.log`.
- Independent three-tarball strict TypeScript/runtime consumer, no workspace
  symlinks or skipped declaration checks, including `stagedNativeConfiguration`:
  `.local-artifacts/packed-consumer/2026-10-18T20-50-49-304Z.json`.
- Original four private OAS snapshots: 47/47, with no source rewrite or business
  API execution. Log: `.local-artifacts/native-instance-real-oas.log`.
- Usage and scheduling boundaries: [native runtime inputs](native-runtime-inputs.md).

This is not broad model-quality evidence or complete OSS goal achievement. General
semantic/provider coverage, remaining host/lifecycle gates and the unapproved Ajv
workaround remain open. No server, UI, product commit/push or publication was added.

## 2026-10-19 regression checkpoint after the scope audit

No production implementation or new files were added during this checkpoint.
The existing source-boundary edits were checked with a clean `npm test` build:
937/938 tests passed, with no skipped or cancelled tests. The sole failure remains
`prototype-looking JSON keys remain ordinary OAS data in runtime slot assignment`
in `test/workflow-template.test.mjs`. All workspace no-emit typechecks, lint and
format checks passed. These results do not establish broad conversational quality.

The installed Ajv property enumerator explicitly excludes `__proto__`; its
`additionalProperties` implementation consumes that same filtered list. A direct
reproduction rejects the unchanged, own-property JSON data both with
`ownProperties: false` and `ownProperties: true`. No field ban, OAS rewrite,
dependency patch, test skip or unapproved compatibility workaround was applied.
The failed standard-contract case and the overall completion gate remain open.

The subsequent question-budget check found an unnecessary minimum of two choices
in both Core settings and proposal schemas. Both now allow one choice up to the
explicit host maximum. The canonical usage example reads the existing environment
helper instead of embedding its question budgets. A real host-stage regression
checks the transmitted limits, accepts the valid question and rejects too many
choices without truncation or a model retry. Focused checks passed 25/25; the new
full regression passed 938/939, with only the same Ajv failure. Root typecheck,
lint, format and whitespace checks passed. No new source files were added, and
this check did not call Chomsky or execute n8n.

The next real-model regression used new short wording for the existing ICL
conversation: request one item's basic information, answer the missing item ID,
add a price lookup using the returned item ID, then cancel that addition. All 34
original operation candidates remained available. Ten Chomsky calls and three
isolated n8n executions passed, with 1/2/1 local requests and zero business API
calls. The price request used a distinct response marker; deletion preserved the
original call instance and values. The harness now explicitly asserts that
requested response binding after planning, without supplying it as a selection.
Evidence: `.local-artifacts/canonical-input-reply/1792346046839-83178/`.
Only the existing integration scenario and assertions changed; no production
implementation, model output repair or hidden retry was added. This is another
known-contract development case, not an unseen-service or general quality rate.

The response-guard variant then supplied the registered IF and Stop And Error
capabilities and asked, in a short follow-up, to look up the returned item's
price only when the response body's numeric `code` is zero. The model selected
the API/native instances, parameters and connections. All 34 original API
candidates remained available; expected operations and bindings were assertions,
not supplied selections. The same imported workflow passed the `code: 0` case
and stopped at the actual Stop And Error node for `code: 1`, with no price
request. Both stimuli passed the unchanged OAS response contract; this condition
is a response-body value, not an expected HTTP status.

An initial nine-call run ended because the harness expected a candidate instead
of the valid question asking for an error message. That run and its unchanged
question remain at
`.local-artifacts/canonical-input-reply/1792347130489-85779/`; it did not execute
n8n. The existing harness now checks the question's typed native owner and sends
an explicit fixture-user message through the public `revise` path, then approves
the replanned candidate. It does not fill a model parameter or retry a rejected
model output. The distinct subsequent run made 17 Chomsky calls and executed
three successful workflows plus the expected failing guard case. Its five local
requests include a price request using the distinct source-response item ID.
Cancelling the addition removed both native guards and the price API while
preserving the original API instance, values and bindings.

Evidence: `.local-artifacts/canonical-input-reply/1792347315686-86060/`.
The `workflow-add-price.json` file is an SDK-generated import artifact using
temporary local service/credential references, not a production deployment.
Business API calls remained zero. Only existing fixture/integration files were
changed; no production implementation, new source file or Ajv compatibility
workaround was added. This proves this reviewed ICL/native conversation and both
runtime branches, not general multi-service or long-conversation quality.

Final checks for this response-guard checkpoint: root typecheck, lint, format,
whitespace and documentation links passed. The fresh full regression passed
938/939 with no skipped or cancelled tests; the only failure is the unchanged
synthetic `properties.__proto__` case. Product changes remain uncommitted and
unpublished, and the complete conversational OSS goal remains open.

The subsequent explanation audit found a reference-host presentation gap, not a
missing Core/model proposal contract: typed stage and routing explanations were
retained in checkpoints but omitted from the question/final-review interrupt
payload. With explanations enabled, the existing host now supplies detached
`planningResults` records at all three interrupt kinds. Disabled views omit the
field. The original typed records are reused without a summarization call or
generated substitute explanation; initial clarification retains its reasons on
the original round and does not invent a completed plan.

The review source token now also binds stage results, routing and natural-input
answer history. Regression tests first reproduced both the missing display field
and a changed stage reason being accepted with the old token. After the change,
the existing actual LangGraph/checkpointer tests expose the matching original
records and reject stale approvals without extra model calls. This changes only
the official example's presentation/review boundary; Core planning and SDK JSON
generation are unchanged. Source existence and stable approval scope do not
prove a model's explanation is semantically justified or in the intended language.

For this presentation/review checkpoint, the related conversation, source-choice
and suggestion checks passed 31/31, and the added initial-clarification view check
passed separately 1/1. Fresh root typecheck, lint, format, whitespace and document
links passed. The full regression passed 941/942 with no skipped or cancelled
tests and only the existing synthetic Ajv key failure. No new source files,
Chomsky calls, n8n executions, product commits or releases were added in this
checkpoint. The pre-existing real-model/runtime evidence is not counted as a new
post-change execution.

The next native-input check verified the canonical whole-object runtime path with
the full original ICL catalog. A short follow-up explicitly leaves the Stop And
Error message to execution-time input. With the host option enabled, Chomsky
selected runtime ownership rather than inventing a message; code allocated one
typed native slot. Twelve actual model calls and five isolated n8n checks passed:
three normal executions and two expected rejections (missing native input before
any request, and the declared nonzero response branch). A supplied
expression-looking error string was preserved exactly, the price request used
the actual predecessor response ID, and cancellation removed the native slot.
Evidence: `.local-artifacts/canonical-input-reply/1792348822314-91273/`.
Business API calls were zero. Only the existing fixture and integration scenario
were extended; no production implementation or new source file was added. This
does not close mixed literal/runtime native fields or broad quality gates. See
[native input scope](native-runtime-inputs.md#canonical-conversation-checkpoint-2026-10-19).

The separate previously DNS-blocked `planNativeNodes` live composition then
passed unchanged with three model calls and one isolated n8n execution:
`.local-artifacts/native-runtime-live/1792349057013-92561/report.json`.
Actual runtime JSON reached the echo request unchanged, the independent health
call executed, and Merge completed. Its API materials/contracts are explicitly
supplied synthetic fixtures; this is not an additional real-OAS selection case.
Final root checks passed; full regression remained 941/942 with only the known
Ajv failure, no skipped tests and no compatibility rewrite. Mixed-field native
slots are a remaining library representation task, not an OAS acceptance rule
or proof that n8n requires whole-object ownership. Product implementation,
commits and release state are unchanged by this verification checkpoint.

## Explicit mixed native input checkpoint (2026-10-19)

Core's canonical native representation now accepts
`runtimeParameters: { pointers: [...] }` in addition to the existing whole-object
`true`. Only those fields become typed slots; other literal parameters remain
unchanged. Ownership conflicts, overlapping pointers and invalid closed-schema
targets fail. Original schema resources own both projected field validation and
complete-object validation after assignment. No value, container type or sparse
array prefix is fabricated. Field order does not change slot identities.

The same pure Core materializer is bundled independently for native execution.
Both template global preflight and the immediate native guard validate the full
original object, including correlated union rules. The existing SDK Set and
StopAndError fragments remain responsible for the actual nodes. The Korean guide
now distinguishes a whole-object slot from a pointer-owned field. Shared types,
JSON field assignment, contract derivation, materialization and native bundle
building have separate named files; no server or generic planning framework was
added.

Focused native input checks passed 16/16. The final separate-native-runtime run
passed ten isolated n8n cases, including missing/valid/wrong-type partial inputs:
`.local-artifacts/native-runtime-inputs/1792350702906-97661/report.json`.
Valid partial inputs preserve the fixed literals and execute the two local API
branches and Merge; missing or wrong-type partial inputs make zero requests.
The first pre-split-runtime run also passed and remains a separate artifact.
Full regression passed 945/946 with no skipped/cancelled tests and only the
unchanged Ajv synthetic key failure. Root typecheck, lint, format, whitespace and
documentation links passed; the new build script also passed explicit lint.
Original private OAS integration passed 47/47 separately, without model or
business API calls.
An npm pack dry-run includes the native bundle and guard; this is not a new
independent-consumer installation result. The explicit URL-import lint correction
rebuilds the exact same native bundle bytes used in execution.

This is the explicit Core/SDK foundation only. Existing native LLM schemas still
choose literal or whole-object runtime parameters. Partial ownership selection,
typed remaining-literal generation, checkpointed host composition and edits that
preserve/explicitly transfer partial ownership remain to implement. No real model
or business service was called in this checkpoint. Product changes are
uncommitted, unpublished, and do not finish the complete goal.

## Native field ownership edits checkpoint (2026-10-19)

Existing native instances now support explicitly requested `defer` fields through
the separate target-selection and typed-value stages. A code-owned native change
applier is shared by parameter validation and atomic assembly, preserving all
unselected literals and runtime owners. Set transfers only its selected field to
a literal; remove can retire an optional owner without a fabricated prior value.
Defer/remove-only contracts need no value-model call or supplied model. Mixed
contracts send only set fields to the typed value schema and prompt.

The target model receives actual pointer ownership, not a boolean that erased
partial ownership. The canonical host forwards the runtime opt-in consistently
across both checkpointed stages. Whole-object ownership still requires a whole
literal replacement; unknown runtime-owned parents cannot have missing siblings
invented by a child edit. Array suffix deferral retains original positions, while
sparse literals and implicit runtime-index shifts are rejected rather than filled
or remapped. OAS document acceptance is unchanged.

Focused native/runtime checks passed 35/35 and canonical/HTTP checks 18/18; the
expanded actual ChatOpenAI transport check separately passed, exposing only set
fields in the value schema and making no second request for deferral-only work.
Original private OAS integration passed 47/47. The full clean-build regression
passed 952/953, with only the unchanged synthetic Ajv key failure and no skipped or
cancelled cases. After the type-only optional-model contract correction described
below, the final clean-build regression again passed 952/953. Root typecheck,
lint, formatting and whitespace checks passed.

Real Chomsky planning through the canonical memory-checkpointed conversation passed
three successive turns: defer count/marker, confirm numeric count, then confirm
literal marker. Eleven model calls produced unchanged API bindings/connections;
the first turn made zero value calls, each confirmation made one. Five isolated
n8n 2.37.10 executions passed their assertions: two missing-input errors before any
external request, and three normal executions with two local requests and Merge
each. Expression-looking text, false and numeric zero retained their JSON types.
Evidence: `.local-artifacts/native-field-ownership-live/1792352476561-1565/report.json`.
This starts from an existing synthetic DAG and is not a real-OAS selection or broad
semantic-quality benchmark. Business service calls were zero.

The first harness attempt made three successful model calls, then incorrectly
supplied `initialDraft` on the second turn. The host correctly rejected that
overwrite before another model request. Its failure artifact remains under
`1792352417896-1444/`; only the harness's first-turn flag was fixed. An independent
installed consumer then exposed a public type mismatch: deterministic removal/
deferral worked without a model, but the native value input type required one.
That input now matches the existing runtime boundary and optional API-edit
pattern; actual set work still requires a structured-output model. The original
failed install/typecheck report is preserved rather than hidden with a stub model.
The fresh independent consumer passed after that correction, installing three
tarballs without workspace symlinks and compiling with strict TypeScript and
`skipLibCheck: false`. Its explicit field-deferral case supplies no model, retains
the original ICL API bindings/connections and compiles typed runtime inputs.
Evidence: `.local-artifacts/packed-consumer/2026-10-18T19-45-27-782Z.json`;
the earlier typecheck failure remains at `2026-10-18T19-42-28-497Z.json`.

Automatic mixed ownership for new native additions/standalone planning, broad
multi-turn quality, and the unresolved Ajv compatibility policy remain open.
Product changes are uncommitted and unpublished; the complete goal is not done.

## New-native field ownership checkpoint (2026-10-19)

New draft-native instances now expose a separate
`selectWorkflowDraftNativeNodeParameterOwnership` call and a code-validated
ownership receipt. The remaining-value stage cannot change that selection. Core
derives only the unowned typed fields, preserves their required constraints, and
emits `native-mixed` for field ownership. Entirely deferred configurations/fields
need no value call. The canonical host checkpoints ownership independently before
values and retains the original decision/evidence in review results. An explicit
resume after a value-stage failure does not replay ownership selection.

Finite static-reference paths and literal array prefixes are tested. Two schema
construction defects were found during verification: the first implementation
bundled a self-contained schema into itself, duplicating its ID; real Chomsky then
rejected a boolean false field schema and an optional wholly owned empty ancestor.
The schema now retains its single resource, omits redundant forbidden declarations
only in closed objects, and leaves wholly owned unambiguous parent construction to
the existing original-schema runtime materializer. Open/pattern constraints are
not weakened. Original native/OAS execution contracts and data remain unchanged.

The final real-model mixed addition passed two calls: ownership chose count and a
nested value; the remaining-value model returned only enabled=false. Explicit
runtime values retained numeric zero and expression-looking text, existing nodes,
API bindings and connections; SDK compilation passed. This synthetic existing-DAG
probe did not execute n8n. Evidence:
`.local-artifacts/native-addition-mixed-live/1792354532006-6608/report.json`.
The two preceding 400 reports remain at `1792354007205-4833/` and
`1792354213711-5385/`. Those three probes made six model attempts, not two in total;
no model output was patched and no retry was hidden in the library.

Focused native/API projection checks passed 70/70 before the final model-shape
normalization; native addition/HTTP checks then passed 20/20. The final clean-build
regression passed 959/960 with no skipped/cancelled cases and only the known Ajv
synthetic key failure. Original private OAS integration passed 47/47. A fresh
three-tarball consumer passed strict TypeScript with skipLibCheck=false, without
workspace symlinks, including a model-free newly added field-owned native instance:
`.local-artifacts/packed-consumer/2026-10-18T20-15-36-700Z.json`.

The full ICL canonical conversation then passed eleven real model calls and five
isolated n8n assertions (three normal executions, missing input before zero calls,
and an intentional code-mismatch StopAndError after only the initial API). The new
StopAndError owns only `/message`; no value-generation call supplies its message.
The later price request uses the actual preceding response identifier, and removing
the addition preserves the original call. All 34 original operations remained
available; business API calls were zero. Evidence:
`.local-artifacts/canonical-input-reply/1792354598160-6751/report.json`.
Across the three mixed-addition probes and this ICL run there were seventeen model
attempts, including the two preserved schema rejections.

The standalone `planNativeNodes` mixed-field path, wider semantic/provider quality
and the unapproved Ajv workaround remain open. This is not overall goal completion;
product work remains uncommitted and unpublished.

## Responsibility boundary

- **Core:** authoritative OAS/native contracts, requirements and draft data,
  explicit edits, impact analysis, review coverage, deferred input contracts and
  deterministic validation.
- **LangChain adapter:** bounded calls for clarification, API/native selection,
  explicit value extraction, references, connections and edit proposals. The
  model does not write revisions, validation results or final n8n JSON.
- **n8n adapter:** deterministic SDK compilation, editable input configuration,
  preflight/per-request checks and Korean guide/slot data.
- **Host LangGraph:** call order, memory/session lifetime, human review/resume,
  concurrency, model injection and optional improvement loops. The official
  example is a reference composition, not a mandatory library-owned graph.
- **UI:** chat, questions, review, read-only preview and downloads. UI/server
  implementation and direct n8n save/execution are outside this OSS goal.

## Goal requirements and evidence ledger

| Requirement                                                                                       | Current state                                                                                                                                           | Evidence / remaining gate                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standards-based OAS intake, composable API/native primitives                                      | Existing implementation                                                                                                                                 | Existing OAS, binding, topology and SDK suites; re-run with additions                                                                                                                                                                              |
| Serializable drafts with stable supplied instance identities                                      | Core and canonical host boundaries implemented                                                                                                          | Draft and host suites verify code-owned IDs, repeated roles, completed turns and selected original-contract identities                                                                                                                             |
| Atomic revision-checked edits and explicit conflicts                                              | Implemented core boundary                                                                                                                               | Same test; errors preserve the original draft, no implicit edge/ref repair                                                                                                                                                                         |
| Structural impact analysis and unaffected approval preservation                                   | Implemented core boundary                                                                                                                               | Same test; new consumers preserve unchanged sibling coverage                                                                                                                                                                                       |
| Deferred decisions and independent planning readiness                                             | Core/host scheduling with selected API response contracts and declared native prerequisites implemented                                                 | Consumer-first native selection waits without a model call; independent work proceeds and unavailable sources remain typed questions; general semantic lifecycle remains open                                                                      |
| OAS-derived runtime input slots, without dummy values                                             | Implemented core boundary                                                                                                                               | `test/deferred-api-inputs.test.mjs`, private `integration/real-oas.mjs`                                                                                                                                                                            |
| Required/malformed/stale runtime value rejection                                                  | Implemented core boundary                                                                                                                               | Slot tests; no coercion/defaults, complete OAS check after assignment                                                                                                                                                                              |
| Native parameter slots and execution-time configuration contracts                                 | Whole-object/field-pointer inputs, scoped edits, draft-native stages and independent role/value stages implemented for runtime-independent capabilities | Original schema/ports retained; staged standalone/draft values and checkpoint resume verified; compact planNativeNodes intentionally retains its single-call literal/whole-object contract                                                         |
| Dynamic clarification questions, evidence and optional suggestions                                | Core/LangChain, scoped facts and opt-in canonical host implemented                                                                                      | Typed/deferred replies, code-owned facts/scopes and fresh optional follow-ups at every actual HITL boundary                                                                                                                                        |
| Optional explanations/evidence across every planning stage and suggestions at every HITL boundary | Stage-specific evidence partly implemented; all actual host follow-up boundaries implemented                                                            | Review follow-ups have typed reasons/source contracts and explicit adoption; remaining selector/planner explanation coverage is still open                                                                                                         |
| Model edit proposals constrained to current materials                                             | Semantic analysis, scoped API/native edits and selected API/native instance planning implemented; composition remains                                   | Actual instance/target/port-constrained decisions, provenance and explicit patches. Current material rebinding is implemented; operation/host composition and broader explanation coverage remain                                                  |
| Scoped edit preservation and consumer repair work                                                 | Implemented core boundary for tested contracts                                                                                                          | Explicit patches, independent original/candidate material snapshots and cascading consumer repairs; broader real-model and official host integration remain                                                                                        |
| Requirement-to-node scopes and question lifecycle                                                 | Scoped facts, explicit answer revision, canonical requirement journal, selected identities and exact-stage question ownership implemented               | Actual owner/phase references and source evidence are validated; owned concerns no longer create duplicate global blockers or replay at a later phase; general semantic classification/supersession remains a separate quality/lifecycle gate      |
| Code-controlled ready/deferred planning and minimal model calls                                   | Core staging, API response declarations and native material readiness implemented in checkpointed host stages                                           | Five-API branches pass; wholly bound consumers make zero literal calls; declared native prerequisites defer only their consumers without fake schemas or retries                                                                                   |
| Extensible registered native feature enumeration                                                  | Adapter and opt-in canonical host integration implemented                                                                                               | Eleven-family enum, four stable late-bound definitions, strict selection and visible host-context inventory; JsonOutput still requires its host-owned original schema                                                                              |
| n8n SDK templates with central inputs and fail-fast preflight                                     | Implemented for tested contracts; final gate open                                                                                                       | Four isolated n8n cases passed; special JSON-key Ajv regression remains                                                                                                                                                                            |
| Same-revision JSON, Korean guide and slot inventory                                               | Implemented export data boundary                                                                                                                        | API/native input mappings and guide share one revision; host download integration remains                                                                                                                                                          |
| Completed-plan edits and question-time changes in LangGraph example                               | Canonical host with optional initial clarification implemented                                                                                          | Checkpointed model/question stages, explicit reanalysis and archived original results; full lifecycle remains open                                                                                                                                 |
| Memory-only HITL reference composition, no mandatory DB                                           | New reference uses an explicit host-owned checkpointer                                                                                                  | Actual MemorySaver tests cover resume/stale review, isolation and no replay; lifetime/concurrency/restart durability remain caller responsibilities                                                                                                |
| Real-model, private OAS and isolated n8n evaluation                                               | Host edits, API/native additions and native-only registered composition checked; full evaluation open                                                   | Actual answer-revision path uses fifteen model calls; registered native composition uses four; latest explicit requirement deferral/withdrawal uses two and executes unchanged native materials in isolated n8n; none is a broad quality benchmark |
| Package installation, declarations, docs and regressions                                          | Current additions checked; complete-goal gate remains open                                                                                              | Independent consumer passes; existing special-key failure still fails the full suite, remaining features need their own gates                                                                                                                      |

The full goal remains open until every required gate is proven. A completed core
module does not establish end-to-end completion. Webhook/callback expansion,
every n8n built-in, canvas editing, restart-proof storage and direct deployment
are deferred scope, not missing completion criteria for this agreed iteration.

## Canonical API literal origins: current implementation

The canonical new/replacement API argument boundary now verifies a selected
`literalSources` entry for every model-proposed leaf (or one exact JSON subtree).
It retains the actual OAS-typed `values` output. Original current/background user
message IDs, complete source occurrence, JSON/text parsing and typed equality are
checked in Core; duplicate/overlapping/missing sources fail without value deletion,
coercion, defaults or a model retry. Empty proposed inputs require no fabricated
source. Bound/confirmed values retain their existing separate ownership paths.
Verified occurrence receipts survive with explanations disabled and are not added
to executable resolutions. The source reader/token-boundary implementation is
shared with the existing natural API-answer extractor.

The first actual explicit-value test failed after two model calls because its
source pointer was `/values/query/gdNo`. Evidence is preserved at
`.local-artifacts/canonical-input-reply/1792343356936-74893/`.
The owning context had exposed a wrapper schema while requesting a values-relative
pointer. The canonical description now serializes the values schema at that same
root, and the wire pointer pattern derives actual OAS input roots. Neither code
nor tests strip an erroneous metadata prefix or repair an output.

The distinct-response add/remove-price test then passed with ten model calls and
three isolated n8n executions:
`.local-artifacts/canonical-input-reply/1792343240845-74526/`.
After the pointer-context correction, the explicit-first-value variant passed
with nine model calls, an actual verified literal receipt, and three executions:
`.local-artifacts/canonical-input-reply/1792343528886-75560/`.
Both retain all 34 ICL operation candidates, preserve the original API instance,
consume the different response marker and make zero business API calls. These
are explicit reviewed known-service cases, not a broad selection quality rate.

This validates literal occurrence and typed equality, not semantic entailment or
every public/legacy generator's input provenance. General semantic lifecycle,
safe broader stage reuse, remaining native/runtime cases and the existing Ajv
special-key regression remain open gates. See [the source contract](canonical-api-literal-sources.md).

Final checks for this boundary passed: focused source/answer/canonical/media/
transport/docs 67/67, original private OAS 47/47, build/workspace typecheck,
lint/format/whitespace, and a strict independent three-tarball consumer:
`.local-artifacts/packed-consumer/2026-10-18T17-15-45-556Z.json`.
The consumer verifies both a checked source receipt and rejection of the same
nonempty proposal with no source. Full regression passed 914/915 with only the
unchanged Ajv special-key failure. An earlier new regression expected a later
fingerprint error, but existing plan-context validation correctly rejected the
changed background source earlier; the test now asserts that actual boundary.
No product guard was relaxed. An initial pack invocation omitted its mandatory
OAS/input environment paths and failed before packaging; the successful final
installation used the explicit same ICL snapshot and supplied input file.

## Short follow-up verification: original input-origin failure

After VPN reconnection, the existing full-ICL short-request/natural-answer
execution passed again: four actual Chomsky calls, one isolated n8n execution,
zero business API calls. Evidence:
`.local-artifacts/canonical-input-reply/1792341688598-69498/`.

A new same-session add/remove-price scenario preserved the original API instance
and values, selected the price operation from all 34 original ICL operations,
and planned an actual `/result/gdNo` response binding. Its first run passed ten
model calls and three isolated n8n executions (1/2/1 local requests):
`.local-artifacts/canonical-input-reply/1792341869385-69939/`.
Equal initial/response identifiers in that fixture cannot independently prove
runtime response consumption from observed values alone.

The stronger fixture used a distinct OAS-valid response identifier and observed
that identifier in the price request. It also exposed an unrequested optional
`enableCache: true` in the model's literal proposal. The unchanged request was
rejected by the local scenario server; this run failed and is retained at
`.local-artifacts/canonical-input-reply/1792342037323-70763/`.
The model had completed the deletion plan, but its workflow was not executed
after the earlier execution failure. Do not count all three executions as passed.

This is not a new OAS restriction, Zod default injection or a demonstrated n8n
Boolean serialization bug. The optional Boolean is valid OAS data, but the user
never supplied it. Current value schemas check original OAS types, and canonical
evidence checks actual message/source IDs; neither proves per-literal text origin.
The argument prompt prohibits invented/default values, but that policy is not
yet independently enforced at this boundary. The original failure also reflects
the fixture passing raw Boolean query text to a typed OAS validator. Its scenario
oracle now checks expected string wire inputs before OAS validation, without
pretending to implement a general HTTP query decoder or repairing the failure.

Production behavior was not changed or patched with a field blacklist/output
deletion. A field-specific checked input-source contract remains required;
reuse of the answer-source parser must be evaluated at the owning Core boundary.
The broader OSS goal and this input-origin quality gate remain open. See
[the detailed verification report](canonical-short-followup-verification.md).

## Canonical natural-language API input replies: current checkpoint

The composable answer-source extractor existed, but canonical draft questions
accepted only typed input answers. The official host now accepts `reply-inputs`
only at real API input questions. A separate checkpointed extraction node reuses
`analyzeApiInputAnswers`; deterministic application replays actual source choices
against the original reply, pending contracts and current question token. It
preserves the semantic plan and prior binding/value stages, raw user prose and
per-answer provenance. Typed direct answers continue to avoid extraction calls.
No parsing/repair rules were copied into the host. The public analysis result
now retains checked `sources` even when optional model reasons are disabled.

A broader short-query ICL execution exposed a redundant binding question before
the value stage. Code now skips that model choice only for a single selected API
with no other selected identity, no output candidates and no declared owned binding
concern. Pending producer identities and explicit binding concerns are preserved.
Missing values remain real questions, never guessed values or literal defaults.

The original two-call failure is retained at
`.local-artifacts/canonical-input-reply/1792340401466-66588/`. A new actual run over
the full supplied ICL catalog completed with four Chomsky calls and one unchanged
SDK workflow execution in isolated n8n 2.37.10:
`.local-artifacts/canonical-input-reply/1792340646705-67211/`.
No expected operation was injected into model output or repaired, no model retry
was used, and no business service was called. This is one known-service short-query
case, not a broad quality rate. Related canonical/legacy answer/edit/transport/docs
checks passed 73/73 and private original-OAS integration passed 47/47. Fresh
build/workspace typecheck, lint, format and whitespace checks passed. Full
regression passed 908/909 with only the unchanged Ajv special-key failure; it
was not skipped or covered by a new schema workaround.

The existing root-binding HTTP fixture initially queued a binding response for
a request that no longer occurs, and an older typed-answer test still expected
the removed model call. The fixtures now assert actual stage names, zero isolated
binding requests and unchanged typed-answer behavior instead of making production
issue an unnecessary call. Clean focused/full reruns passed as reported above.
The independent strict consumer passed with automatic dependency installation,
no workspace symlinks and no skipped library checks:
`.local-artifacts/packed-consumer/2026-10-18T16-28-51-663Z.json`.
All general lifecycle, reuse and held-out quality gates remain open. Product
changes remain uncommitted and unpublished.

See [canonical natural replies](canonical-natural-input-replies.md).

## Removed-requirement semantic restoration

The earlier canonical history supported `restored` changes but semantic edit
schemas and the official host could not select a removed requirement. This gap
was reproduced before implementation. The new `restore-requirement` decision
enumerates only latest removed history heads, shown separately from current
requirements. It cannot target an active/unknown ID or introduce replacement
fields, history, revisions or graph data as model output.

Core routes restoration through the existing explicit typed requirement answer,
candidate reconstruction, atomic history and approval-impact boundaries. The
reference snapshot is not an inferred default: every replacement field is required.
The official host supports both review/automatic policies, rejects invalid scopes
without replay and retains independent stage scheduling. This closes the explicit
restoration path, not general semantic supersession or safe arbitrary stage reuse.

See [restoration contracts](workflow-draft-requirement-restoration.md). Actual
Chomsky selected one restoration; review and replacement fields were explicit
test UI actions. The unchanged native workflow ran in isolated n8n 2.37.10 with
zero business API requests. Artifacts:
`.local-artifacts/requirement-restoration/1792311665007-61719/`.
Focused edit/history/restoration/ownership/scope/docs tests passed 67/67 and the
original private OAS integration passed 47/47. Fresh build/workspace typecheck,
lint, format and whitespace checks passed. Full regression passed 901/902 with
only the unchanged Ajv special-key failure; it was not skipped or hidden.
The strict independent tarball consumer also exercised restoration and passed
without workspace symlinks or skipped library checks:
`.local-artifacts/packed-consumer/2026-10-18T08-26-35-395Z.json`.

One focused run overlapped dist cleanup by the full build and is not accepted
as verification evidence. It was rerun only after build completion. A new test
also incorrectly expected the existing unfiltered ownership API to return no
planning-step owners; the assertion was corrected to verify the actual owner
rather than changing production behavior. Clean focused/full reruns passed as
reported above. Product changes remain uncommitted and unpublished. The full
goal remains open.

## API input-answer source extraction

`analyzeApiInputAnswers` now asks the model only for offered requirement IDs and
exact reply spans, plus optional same-call brief reasons. Code parses the source,
checks OAS types without coercion, computes unanswered IDs and locates complete
literal occurrences. The array-returning `extractApiInputAnswers` remains a
convenience projection. The Core answer schema validates typed answers rather
than asking a model to produce a duplicate value and source representation.

Core's named `arguments/clarification/extraction/` boundary captures actual
pending contracts and reply before await, resolves sources and reconstructs
optional evidence records. It preserves raw JSON/OAS own properties instead of
using Zod's reconstructed JSON output as the value. The official conversational
host supports `answerOptions` and accumulates extraction records across turns;
typed direct replies still bypass the model and do not acquire fictitious reasons.
These records do not enter later graph calls or executable SDK JSON.

See [answer extraction](api-input-answer-extraction.md). Exact-source/OAS checks
are not proof of semantic user intent or model-reason truth. The original context
must be retained for replay; storage/privacy and latest-document identity remain
host/application responsibilities. Broad quality, lifecycle and the existing Ajv
special-key gate remain open.

Verification on 2026-10-18: focused answer/clarification/host/docs checks passed
34/34; original private OAS integration passed 46/46. Actual Chomsky made three
calls for an explicit identifier, an absent answer and a quoted numeric string.
Two unmodified SDK workflows executed in isolated n8n 2.37.10 with a local fixture
Bearer credential; both query values and OAS request/response shapes were checked.
No business service was called. Artifacts:
`.local-artifacts/api-input-answer-extraction/1792310664824-59464/`.

The harness initially omitted required bindings before any model call, then
passed the wrong wrapper to its request validator after one actual answer call.
Those test-tool inputs were corrected rather than changing production contracts,
request values or credentials. Early logs without diagnostic detail are not
treated as evidence of a network cause. The private-OAS and independent-consumer
fixtures were also corrected to explicitly select declared media; the consumer
then exposed a missing test import, which was added without changing package APIs.

Fresh build/workspace typecheck, lint, format and whitespace checks passed.
Full regression passed 891/892 with only the unchanged Ajv special-key failure;
it was neither skipped nor covered by a schema workaround. The independent strict
tarball consumer passed with automatic runtime dependency installation and no
workspace symlinks or skipped library checks:
`.local-artifacts/packed-consumer/2026-10-18T08-07-23-208Z.json`.
Product changes remain uncommitted and unpublished; the complete goal remains open.

## Combined graph reasons, original contracts and model-created Merge

Both `planWorkflowGraph` and `planReviewableWorkflowGraph` now accept optional
`includeExplanations: true`. The same strict function call includes a brief overall
reason, one reason for each NEW native instance and edge, and each newly blocked
ready call in reviewable mode. Prepared instances/parameters and existing gap
descriptions are not regenerated as explanations. No evidence, source copy, roots,
request values, response bindings or SDK JSON is model-generated by this addition.
The disabled option preserves the execution result shape.

Core's `workflow/graphs/` owns context capture, explicit prepared/additional
assembly and planning-record creation/validation. Shared material data, schemas
and types live in named planning modules rather than in the LangChain adapter or
connection-only implementation. The original request-schema deduplication comment
was preserved when that projection moved into Core. The shared data capture does
not validate a future native producer against a prepared-only connection registry;
each stage validates after it has the actual required materials.

The code snapshots actual API OAS/values/bindings/roles, prepared native values,
implementation/generation schemas and outputs before awaiting the model. It keeps
the actual minimal model context separate from the original validation sources.
Class callbacks keep their receiver; arbitrary closure or Zod-internal state is
not cloned/authenticated. Observable source-contract drift fails without repair.
Only supplied optional operation metadata is projected; no undefined optional
field becomes a made-up value during JSON persistence.

`graphPlanning` separates the actual new-node/edge/gap proposal, paired reasons,
canonical plan, supplied evidence and post-validation contracts. Reconstruction
checks the original sources, exact reason coverage, prepared identity preservation,
actual plan and derived receipts. API/native IDs, parameters and data types are
not repaired or guessed from matching field names. Legacy executable gap reports
remain non-executable with no starts and explicitly have `needs-review` verification,
not a false full-DAG certificate. Validated reviewable graphs may still have gaps;
their contract validation is not a claim of execution readiness.

An explicit empty native registry now supports API-only executable as well as
reviewable planning. The prior executable requirement for at least one native
definition was removed. Impossible addition/blocked-call fields are omitted from
the model schema and completed as code-owned empty choices, not fallback for
missing required model fields. Schema authoring remains Zod; actual transport is
the shared plain-JSON output/2020-12 serializer with no keyword patching or aliases.

The two corresponding official one-shot hosts expose `graphOptions`, review
callbacks and `graphPlan.graphPlanning`/`reviewPlan.graphPlanning`. Earlier audit
metadata is not forwarded to this stage or included in SDK JSON. Fully bound API
inputs do not cause a new literal call. These combined APIs propose new parameters
and connections in one call, so new ports are derived/validated after proposal.
The canonical staged conversational route remains `planNativeNodes` then actual
contract derivation then `planWorkflowConnections`; callers can review between them.

Verification on 2026-10-18:

- Sixteen new tests cover both modes, reasons, native additions/prepared identity,
  future native producers, API-only/native-only contexts, actual HTTP schemas,
  invalid data/proposals, immutable records, contract drift and official hosts.
  Final related graph/native/connection/media/literal/host/documentation checks
  pass **133/133**. Log: `.local-artifacts/graph-planning-focused-final.log`.
- Original private OAS checks pass **45/45**. The added case preserves selected
  original contracts from four snapshots and explicit blocked inputs without
  inventing values, editing source OAS or calling business endpoints. Log:
  `.local-artifacts/graph-planning-real-oas.log`.
- Independent strict three-tarball install, public model signatures and Core
  planning-record APIs pass without workspace symlinks or declaration-check skips.
  Report: `.local-artifacts/packed-consumer/2026-10-18T07-14-40-665Z.json`.
- Build/workspace type checks, lint, format and whitespace checks pass. Final full
  `npm test` runs **881 tests**, **880 passing** and the same known Ajv
  `properties.__proto__` runtime-slot regression failing. The command therefore
  exits unsuccessfully; no test is skipped and no field ban or unapproved schema
  workaround is applied. Log: `.local-artifacts/graph-planning-regression-final.log`.
- Actual Chomsky makes **two calls**, one per mode, creating the native Merge
  instance/settings and every edge. Each original official SDK workflow executes
  twice with new runtime IDs in isolated n8n 2.37.10: **four executions**, **twenty
  local HTTP requests**, **five APIs plus native Merge** per execution. Original
  arrays/objects, integer zero and expression-looking strings remain typed data.
  Generated Merge IDs/input order are checked semantically, not fixed or repaired.
  API selection/request bindings are explicit fixtures, not model output in this
  probe. There is no automatic model retry, output repair or business API call.
  Artifacts: `.local-artifacts/graph-planning-records/1792307681583-53980/`.

Initial full regression attempts exposed test doubles that assumed a Zod `.parse`
method on the actual plain JSON transport schema. The doubles now return raw
provider output at those graph stages, and the real adapter still parses/rejects
it. The final focused media/role/literal fixtures also pass **19/19**. Real
ChatOpenAI/Ajv schema checks and all semantic assertions remain; production
has no Zod/JSON compatibility alias or validation bypass. Initial failing logs are
retained rather than reported as passing runs.

See [Korean combined graph guide](graph-planning-records.md). Natural-language
answer-extraction explanations, general requirement supersession, safe bounded
stage reuse, wider quality/lifecycle gates and the existing Ajv special-key failure
remain open. The previous connection-stage rejection without detailed evidence is
also not retroactively explained by this successful probe. No product commit, push
or publish was performed; the full goal is not complete.

## Connection reasons, fixed-material ownership and actual DAG execution: previous checkpoint

`planWorkflowConnections` accepts optional `includeExplanations: true`. The same
strict function call returns a short overall strategy reason, one reason per NEW
edge and one reason per newly blocked ready call. The overall reason covers
independent roots/no new edges. Fixed edges/already blocked calls are not echoed;
gap descriptions already carry their reasons. Disabled explanations preserve the
execution output shape. No explanation-only call, model-built evidence, API value,
native parameter, roots or SDK JSON is added to model responsibility.

Core owns `describeWorkflowConnectionPlanning`, `createWorkflowConnectionPlan`
and record creation/verification under `workflow/connections/`. The deterministic
material preparer moved out of LangChain without a forwarding alias. Shared
API/native source capture lives in `workflow/planning/` with its own types file;
it does not create a fictitious native plan ID to reuse a different stage.
Declared optional inventories may be absent; malformed/null inventories and
required request data fail rather than becoming defaults.

The descriptor snapshots original API OAS/values/bindings/roles, native parameters,
implementation schemas/output contracts and supplied fixed edges before awaiting
the model. The minimal actual model context is recorded separately from those
source-validation receipts. Prior stage audit metadata is not forwarded. Captured
class methods keep their original receiver; arbitrary closure/Zod-internal state
is not cloned or authenticated. Observable contract drift fails without repair.

The returned `connectionPlanning` separates the original explained decision,
canonical plan, actual supplied context/source data and final code-derived node
contracts. Records are validated by reconstruction from original materials and
proposal, including exact fixed-edge/instance preservation and code-derived roots.
Invalid ports, duplicate edges, cycles, missing mandatory producers, incompatible
joins and blocked response consumption still pass through full DAG validation.
Records do not prove explanation semantics, provider authenticity or authorization.

The two connection-based official hosts expose `connectionOptions`, review callback
and `reviewPlan.connectionPlanning`. A request-input interrupt occurs before the
connection call; resumption with explicit human values invokes connections once
using those actual values, without replaying native selection or retroactively
rewriting earlier provenance. SDK workflow JSON excludes the explanation record.
Transport uses the shared plain-JSON output/2020-12 serializer; code does not patch
schema keywords or reinterpret placeholder-looking values.

Verification for this checkpoint:

- Fifteen new tests; final related native/connection/orchestration/conversation
  and documentation checks pass **72/72**. Log:
  `.local-artifacts/connection-planning-focused-verified.log`.
- Original private OAS checks pass **44/44**, retaining four actual original
  selected operations and explicit blocked inputs without inventing values.
  Log: `.local-artifacts/connection-planning-real-oas-verified.log`.
- Independent strict three-tarball installation and public model/core record APIs
  pass without workspace symlinks or declaration-check skips. Report:
  `.local-artifacts/packed-consumer/2026-10-18T06-45-05-356Z.json`.
- Build, workspace type checks, lint, format and whitespace checks pass. Full
  `npm test` executes **865 tests**, **864 passing** and the same known Ajv
  `properties.__proto__` runtime-slot regression failing. The command exits
  unsuccessfully, with no skip, field ban or unapproved schema workaround.
  Log: `.local-artifacts/connection-planning-regression.log`.

The first actual Chomsky probe makes **two calls**: the new parallel/fan-in DAG and
the fixed-edge no-additions decision. One official SDK workflow executes twice in
isolated n8n 2.37.10 with fresh source IDs, **five APIs plus native Merge** per run
and **ten local HTTP requests** total. Zero stock and original arrays/objects remain
typed data. API selection, request bindings and native join settings are explicit
fixture inputs; only graph connections are actual model proposals. No automatic
model retry, result repair or business API call occurs. Artifacts:
`.local-artifacts/connection-planning-records/1792305440043-49502/`.

A repeated final-source probe rejects its first model proposal during connection planning
after **one call** and **zero HTTP fixture requests**. Its initial failure artifact
records only the outer `graph-planning` phase and error type, not the rejected
proposal/cause or precise `proposal-schema`/`graph-validation` stage. Its exact
cause cannot be reconstructed. No claim is made that the network caused it. Artifact:
`.local-artifacts/connection-planning-records/1792305909821-51300/`.
The verifier now preserves original structured planning failures and their
deterministic cause for future diagnostics, without logging provider credentials.

The separate diagnostic run then passes **two actual model calls** and another
**ten fixture HTTP requests** across two fresh-source SDK executions. Artifact:
`.local-artifacts/connection-planning-records/1792305972703-51575/`.
This does not erase the preceding failure. A predeclared, fixed **five-call**
same-input quality probe subsequently passes **5/5** without conditional retries,
SDK execution or output repair. It is a narrow reproducibility check, not a broad
quality benchmark or evidence that the earlier rejection is resolved. Report:
`.local-artifacts/connection-planning-quality/1792306040120-51695/report.json`.
Across these distinct actual-model probes: **ten calls**, one rejected proposal,
**twenty fixture HTTP requests**, and zero business API calls. Branch independence
is verified in the DAG, not as a guarantee of simultaneous network scheduling.

The first private-OAS command did not start the suite because its required
`OPENAPI_FLOW_REAL_OAS_DIR` was omitted. This is an invocation configuration error,
not a passing result or an OAS defect; it is retained in
`.local-artifacts/connection-planning-real-oas.log` before a correctly configured
rerun. A first focused SDK test fixture omitted required transport position and
was corrected explicitly; production code did not supply a position fallback.

See [Korean connection planning guide](connection-planning-records.md). Combined
`planWorkflowGraph`/`planReviewableWorkflowGraph` explanations, natural-language
answer-extraction explanations, general requirement supersession, safe bounded
stage reuse, wider model quality gates and the known Ajv special-key failure remain
open. This is progress toward the full objective, not a completion claim. No product
commit, push or publish was performed.

## Native reasons, implementation receipts and explicit parameter ownership: previous checkpoint

`planNativeNodes` now accepts optional `includeExplanations: true`. One model call
returns a short reason per new instance or an explicit no-additions reason. Code
creates the empty list for the latter. No offered capability means zero calls,
no required model and a code-only `no-capabilities` receipt without a model reason.
Disabled explanations preserve the public nativeNodes/gaps result shape.

Core owns `describeNativeNodePlanning`, `createNativeNodePlan` and provenance
creation/verification. The model receives actual supplied API roles/contracts,
prepared instances/ports and implementation-derived generation schemas, not a
guessed registry. Code derives review IDs and post-validation ports/references/
output receipts. Those verification receipts are distinguished from the context
that was available to the model. Data/registry fields are captured before await;
class methods retain their receiver. Arbitrary JavaScript closure/Zod-internal
state is not cloned or authenticated. Implementations must remain pure/stable;
visible serialized-contract drift fails without repair.

Real execution exposed an ambiguous runtime representation: the model described
execution-time input but emitted literal marker strings and omitted the runtime
flag. Native runtime model contracts now require an explicit `parameterSource`
choice when both modes are available. `workflow-input` contains no values; code
alone creates the canonical empty parameters/runtime flag and typed slots.
`literal` retains typed actual values, including genuine marker-looking strings.
Missing choices, conflicting data and old model flags fail rather than entering an
alias/placeholder-replacement path. This applies with explanations enabled or off;
the returned Core/draft node shape is unchanged. It does not prove semantic model
accuracy on arbitrary scenarios.

Prepared-material projection and identity assembly moved from LangChain into
`core/src/workflow/planning/` with no old internal forwarding aliases. The original
comments remain in the moved implementations. Native schema transport uses the
existing plain-JSON serializer with explicit output/2020-12 semantics; Standard
Schema hooks no longer cause implicit draft-07 input re-serialization on the wire.

The official host retains `nativePlan.proposal` as the original additions-only
result and `nativePlan.nativeNodes` as independent prepared-plus-added execution
materials. `nativeOptions.includeExplanations` exposes the original record at
`nativePlan.proposal.nativePlanning`. Later connection prompts and SDK JSON exclude
audit metadata. Request-input interrupts/resume retain the record without replay.
Explicit `sources: []` now builds a real empty catalog and selects native-only
host stages before API selection; no fake OAS or fabricated missing-API gap is
introduced. Missing/malformed source values and actual invalid OAS still fail.

Verification on 2026-10-18:

- Nineteen new tests cover explanations/no-call/no-additions, typed literal/runtime
  ownership, real HTTP wire schemas, prepared identity collisions, immutable data,
  class private receivers, drift, record tampering/JSON persistence, native-only
  hosts and checkpointed answers. Related native/orchestration/conversation checks
  pass **81/81**. The final documentation-link check separately passes **1/1**.
  Logs: `.local-artifacts/native-planning-focused-ownership.log` and
  `.local-artifacts/native-planning-doc-links-final.log`.
- Private original OAS checks pass **43/43**. The added case retains one original
  operation from each of four snapshots with its supplied role in a native-planning
  context; it neither edits OAS nor calls business endpoints. Log:
  `.local-artifacts/native-planning-real-oas-ownership.log`.
- Independent strict three-tarball install, public types, no-model native planning
  and record APIs pass without workspace symlinks or declaration-check skips.
  Report: `.local-artifacts/packed-consumer/2026-10-18T06-11-34-525Z.json`.
- Final actual Chomsky makes **three model calls**: two explained instances of one
  capability, prepared no-additions, and explicit runtime input ownership. Official
  SDK workflows execute in isolated n8n 2.37.10 with **three local POSTs**. Numbers,
  integer zero, false, nested arrays/nulls/dotted keys and expression-looking strings
  remain data. The runtime value is explicit caller input, not generated by the
  model. Empty-registry planning and fully bound API values make no model calls.
  No automatic model retry, result repair or business API call occurs. Artifacts:
  `.local-artifacts/native-planning-records/1792303895409-46361/`.
- The user's VPN-connected repeat of the same final-source probe also passes:
  **three model calls**, **three local POSTs**, and **zero business API calls**.
  Artifacts: `.local-artifacts/native-planning-records/1792304372881-47557/`;
  log: `.local-artifacts/native-planning-live-vpn-retry.log`.
- Workspace type checks, lint, format and whitespace checks pass. Full `npm test`
  runs **850 tests**, with **849 passing** and the existing Ajv
  `properties.__proto__` runtime-slot regression failing. The command therefore
  exits unsuccessfully; no test is skipped and no field ban/schema workaround is
  applied. Log: `.local-artifacts/native-planning-regression-final.log`.

Two earlier runs under the implicit-flag model contract each made three calls,
passed additions/prepared checks and two POSTs, then failed runtime ownership.
They remain at `.local-artifacts/native-planning-records/1792303218937-44545/` and
`.local-artifacts/native-planning-records/1792303447815-45190/`; the latter preserves
the contradictory literal proposal. They are not erased or counted as successes.
Final API selection, bindings, topology and runtime values in this probe are
explicit fixture inputs. The three native calls do not establish full model-made
orchestration or a broad accuracy benchmark.

See [Korean native planning usage](native-planning-records.md). Full-graph and
natural-language answer-extraction explanations, general requirement supersession,
safe bounded stage reuse, broader model quality and the existing Ajv special-key
failure remain open. No product commit, push or publish was performed.

## Binding decisions and immutable supplied contracts: previous checkpoint

Standalone `planApiBindings` accepts optional `includeExplanations: true`. The
existing strict function call adds one short reason per selected API instance,
including calls with no requested bindings. Original gap descriptions already
state their reasons and are not regenerated in a second explanation field. The
model does not write source evidence, original contract identities or literal
values. Disabled explanations preserve the existing calls/gaps schema and output.

Core's `describeApiBindingPlanning` snapshots only declared source data before
invocation. The actual model context retains supplied call roles, original resolved
operation/effective contracts, derived response pointer catalogs and explicit
native output schemas. Extraneous host metadata/model objects are not forwarded.
Malformed resolved-contract containers, IDs and roles fail before invocation; this
does not introduce a second OpenAPI validator. Caller mutation during the await
cannot replace the source used for subsequent contract checks.

`createApiBindingPlanningRecord` validates the original assignments/gaps and exact
reason coverage. `validateApiBindingPlanningRecord` compares persisted evidence
and pointer decisions to the original input and actual plan. It does not prove a
reason's semantic correctness or provider/caller authenticity. Historical records
require the original input snapshot, not later revised state. No pointer/value
repair, credential invention, name-based source inference or type conversion is
added. Existing typed pointer, overlap, self-reference and cycle checks remain.

The optional `bindingPlanning` sidecar stays separate from executable
`calls[].bindings`. Official generation/conversation factories forward
`bindingOptions.includeExplanations` and expose the record through `reviewBindings`
and state; subsequent graph prompts and SDK JSON receive executable bindings only.
The canonical draft's separate selected-instance binding contract is unchanged.
API-free reference paths retain their existing no-call behavior; the standalone
planner still requires nonempty materials and makes its existing one planning call.

Verification on 2026-10-18:

- Thirteen new tests cover enabled/disabled reasons, native/API sources, gap ownership,
  async mutation, metadata exclusion, stale records, malformed source boundaries,
  actual ChatOpenAI wire schemas, both one-shot host factories and checkpointed
  input-answer resume. The latter preserves the original record, does not replay
  bindings and never assigns a later human value to that model decision. Related
  checks including documentation pass **72/72**. Log:
  `.local-artifacts/binding-planning-focused-final-current.log`.
- Final `npm test` passes **830/831**, with a nonzero exit only for the existing
  Ajv `properties.__proto__` runtime-slot case. No test is skipped and no OAS field
  ban or unapproved schema workaround is applied. Build/workspace typecheck,
  lint, format and whitespace checks pass. Full log:
  `.local-artifacts/binding-planning-regression-verified.log`.
- Original private OAS checks pass **42/42**. The added case retains one representative
  operation per each of four snapshots in a multi-document no-dependency plan,
  without changing OAS or calling business endpoints. Log:
  `.local-artifacts/binding-planning-real-oas-verified.log`.
- Independent strict three-tarball installation, new Core record APIs, public
  adapter option types and runtime pass with no symlink/declaration-check skip.
  Report: `.local-artifacts/packed-consumer/2026-10-18T04-27-47-736Z.json`.
- Final actual Chomsky makes **two model calls**, one five-API binding plan and one
  declared-native-output binding plan. The same SDK-compiled five-API DAG executes
  twice with different newly generated runtime source IDs; the declared native
  producer executes once. Isolated n8n 2.37.10 makes **eleven local requests**.
  All requests use actual runtime values and preserve integer zero, numbers, arrays
  and objects. Fully bound literal generation makes no model call. No automatic
  model retry, output repair or business API call occurs. Artifacts:
  `.local-artifacts/binding-planning-records/1792297666882-39456/`.

The DAG topology and native parameters in that probe are explicit fixture inputs,
not output from those two binding calls. This is a targeted binding/runtime proof,
not complete model-generated orchestration or a broad model-quality benchmark.
The earlier probe before the final native metadata projection also passed two
calls/eleven requests and remains preserved at
`.local-artifacts/binding-planning-records/1792297422960-38849/`.

See [Korean binding-plan usage](binding-planning-records.md). Native selection,
full-graph and natural-language answer-extraction explanations, general requirement
supersession, safe bounded stage reuse, broad real-model quality and the existing
Ajv special-key failure remain open. All additions remain unreleased; no product
commit, push or publish was performed.

## Literal proposals, ownership and repeated API roles: previous checkpoint

Standalone `generateApiArguments` accepts optional `includeExplanations: true`.
The same literal-generation call returns only the existing OAS-derived `values`
and a short reason. Core attaches the original supplied scenario, optional call
role and the actual projected literal-input schema. Model-generated evidence,
source quotes, identities or full OAS contracts are not requested. Disabled
explanations retain the existing output/schema shape without an extra model call.

`describeApiLiteralGeneration`, `createApiLiteralGenerationRecord` and
`validateApiLiteralGenerationRecord` own immutable input snapshots, typed proposal
records and exact source/ownership checks. A `proposed-literals` record contains
only the original proposal, never later confirmed values or preceding-node
bindings. A `not-needed` record has no proposal or model reason; when no literal
fields remain, a model is not required or invoked. Missing/invalid required models
and malformed output fail clearly, without substituted models, retries or repair.
The existing original-OAS final request validation remains unchanged.

The model sees only remaining literal fields and operation metadata. Bound and
confirmed values are not regenerated. Core's actual Zod values schema is retained
when adding the optional reason, rather than being replaced by a generic JSON
object. Existing optional-input behavior and function calling remain unchanged;
strict mode and OAS defaults are not injected.

Shared host material construction preserves each selected API instance's supplied
role and checks its exact original contract identity before format, binding and
value planning. Identical API keys may have different call IDs, formats and values.
Selection order allocates instances; it does not imply execution order. Missing
roles are not inferred. Existing factories expose
`argumentOptions.includeExplanations`; confirmed-only conversation paths do not
add an otherwise unnecessary literal call.

Later graph prompts and n8n request-materialization configuration explicitly
project executable arguments, excluding the audit record and its duplicate source
schemas/scenario. Historical records are checked against their original generation
input, not a later answer-mutated input. This validates provenance consistency and
OAS types, not semantic entailment or caller/provider authenticity. Hosts still
own access control, retention and presentation of scenarios/proposals.

Final verification on 2026-10-18:

- Sixteen new tests cover ownership, absent models on code-only paths, optional
  explanations, immutable snapshots, stale records, repeated API roles/formats,
  graph/runtime exclusion and actual ChatOpenAI function-call schemas. Related
  argument, media, conversation, graph and documentation checks pass **88/88**.
  Log: `.local-artifacts/literal-generation-focused-final.log`.
- Final `npm test`: **817/818**, nonzero only on the existing Ajv
  `properties.__proto__` runtime-slot case. Build/workspace typecheck, lint,
  format and whitespace checks pass. The failure remains visible without a
  skipped test, changed OAS or unapproved schema workaround. Full log:
  `.local-artifacts/literal-generation-regression-final-verified.log`.
- Original private OAS checks pass **41/41**. The new case checks one representative
  original operation from each of four snapshots, without modifying OAS or calling
  business endpoints. Log:
  `.local-artifacts/literal-generation-real-oas-final.log`.
- Independent strict three-tarball installation, declarations and runtime pass
  with the new record APIs and optional model signature. No workspace symlink or
  declaration-check skip. Report:
  `.local-artifacts/packed-consumer/2026-10-18T04-01-38-490Z.json`.
- Actual Chomsky uses **six model calls**: selection, bindings, two role-scoped
  literal calls, independent-root graph planning and a separate mixed-ownership
  literal call. Original SDK JSON imports/executes in isolated n8n 2.37.10 and
  makes **two local GETs and one local POST**. The POST's confirmed identifier is
  explicit fixture input; only its remaining integer quantity is generated.
  There is no automatic model retry, output repair or business API call.
  Final artifacts: `.local-artifacts/literal-generation/1792296100020-35564/`.
- After the user's VPN reconnection, a fresh run independently passes the same
  six-call/three-request checks. The original run remains preserved. Retry log:
  `.local-artifacts/literal-generation-live-vpn-retry.log`; artifacts:
  `.local-artifacts/literal-generation/1792296324218-36043/`.

The earlier narrower probe passed five calls and two GETs before adding the
explicit confirmed-input POST case. It remains separately preserved at
`.local-artifacts/literal-generation/1792295660050-34179/`. These synthetic
scenarios are targeted runtime proofs, not a real-service execution or general
model-quality benchmark. The independent private-OAS checks are not represented
as actual model execution of those services.

See [Korean literal-generation usage](literal-generation-records.md). Standalone
binding/native/full-graph and natural-language answer-extraction explanations,
general requirement supersession, safe bounded stage reuse, broader quality
evaluation and the existing Ajv special-key failure remain open. No product
commit, push or publish was performed; additions remain absent from npm 0.2.0.

## Request-format assessment, code resolution and provenance: previous checkpoint

`analyzeApiRequestMediaType` returns a typed decision rather than conflating model
format assessment and final format resolution. Core distinguishes no request body,
a sole declared format, explicit model selection and an explicit-null assessment
followed by the existing documented default. Code owns kind, original identity,
declared inventory and policy; the model does not regenerate those fields.
`selectApiRequestMediaType` remains the string-only projection of the same path.
Callers choose one API rather than invoking both for the same decision.

Optional explanations use the same model call and ask only for a short reason.
Core attaches unchanged scenario and original OAS requestBody evidence, including
deeply nested schemas. The reason for a null assessment remains attributed to that
assessment; it does not claim the model chose the code's JSON/form/concrete/wildcard
default. Missing or invalid output cannot activate the default. Zero/one formats
still make no model call and fabricate no model assessment/reason.

The common domain, including the unchanged existing declaration list, priority and
default functions, now lives in `core/src/arguments/media/`. Internal imports and
walkthrough links are updated; old internal forwarding aliases are not retained.
Public function names remain stable. Core creates/verifies decisions without any
LangChain/n8n dependency. LangChain owns the optional described output schema and
model call. Canonical conversations use the plan's explanation setting and retain
the actual decision at their request-media stage; earlier reference factories
expose a separate requestMediaOptions setting and the same decision records.

Final verification on 2026-10-18:

- Fifteen new tests include exact source copies, no-call paths, explicit/null
  origin, absent/blank/foreign output, stale/mutated records, actual ChatOpenAI
  function-call schemas and canonical checkpointed option-on/off results.
  Related selection/media/documentation tests pass **35/35**. Log:
  `.local-artifacts/request-media-decisions-focused-final.log`.
- Final `npm test`: **801/802**, nonzero only on the existing Ajv
  `properties.__proto__` runtime-slot case. Build/workspace typecheck, lint,
  format and whitespace checks pass. No failing test is skipped. Full log:
  `.local-artifacts/request-media-decisions-regression-final.log`.
- Original private OAS checks pass **40/40**. The new case derives and validates
  request-format decisions across the original contracts without modifying OAS
  or calling business endpoints. Log:
  `.local-artifacts/request-media-decisions-real-oas-final.log`.
- Independent strict three-tarball install, new public declarations and runtime
  decision APIs pass without symlinks or skipped declaration checking. Report:
  `.local-artifacts/packed-consumer/2026-10-18T03-05-52-558Z.json`.
- Final actual Chomsky verification uses **ten model calls** over two independent
  canonical one-API conversations with explanations enabled. Explicit form remains
  form; unspecified format produces a null model assessment and code-owned JSON
  default. Original SDK JSON imports/executes in isolated n8n 2.37.10, producing
  **two local POSTs**, one form and one JSON. Body values remain a string label and
  integer count in the canonical draft; only standard form wire serialization
  renders the count as text. No model retry, output repair or fabricated human
  answer occurs. Final JSON/states/report:
  `.local-artifacts/request-media-decisions/1792292754417-28405/`.

The initial actual probe before mechanical file relocation also passed ten calls
and two local POSTs; it remains separately preserved at
`.local-artifacts/request-media-decisions/1792292470549-27342/`.
An initial new conversation test incorrectly substring-compared a JSON-encoded
scenario to its unescaped user text. The test now reads the actual message field
and checks exact equality; the product does not rewrite the scenario to satisfy
that assertion. Neither probe is a broad model quality evaluation or real-service
execution. The validator checks declared choices, resolution consistency and
included provenance, not model semantic accuracy or caller authenticity.

See [Korean request-format usage](request-media-decisions.md). The remaining
standalone argument/binding/native/full-graph explanation paths, general
requirement supersession, safe bounded stage reuse, broader model quality and
existing Ajv failure remain open. All additions are unreleased; no product commit,
push or publish was performed.

## Discovery selection explanations and code-owned sources: previous checkpoint

Standalone `selectApiOperations` and `analyzeApiSelection` now accept optional
`includeExplanations: true`. The existing model call emits only a short reason on
each selected API instance, missing capability or consequential choice question.
Core attaches the unchanged scenario and the exact selected candidate, offered
alternatives or entire supplied discovery inventory. No model-generated quotation,
snapshot identity, OAS pointer or explanation-only model call is introduced.

`describeApiSelectionContext`, `createApiSelectionExplanation` and
`validateApiSelectionExplanation` own source snapshots and exact provenance.
Candidate identities and repeated selected call roles remain separate concepts.
Duplicate discovery registrations, missing identities or mismatched operation refs
fail before invocation. Mutation during an asynchronous call cannot rewrite its
source snapshot. This checks context consistency, not provider authenticity or
semantic correctness of a model reason. Discovery evidence is not a full selected
request/response/security contract and is not presented as one.

The optional standalone setting defaults off, preserving the prior model/output
shape. Disabled schemas omit explanation fields; enabled schemas require reasons
on every returned decision. Code-only empty-catalog results still make zero model
calls and do not fabricate a model reason. Human operation answers do not inherit
an ambiguity question's reason as if the model made that human choice. The caller
retains the original analysis and actual answer. Existing reference factories
forward `selectionOptions.includeExplanations`; the real operation-choice interrupt
exposes the evidence without replaying the model.

Verification on 2026-10-18:

- Fourteen new tests cover same-call explanations, repeated roles, document/path
  collisions, missing capability and alternatives, actual host interrupts, option
  validation, missing/blank/invented output, immutable sources and changed/stale
  provenance. The actual ChatOpenAI wire has valid JSON Schema and only the model's
  short reason, not generated evidence. The related suite and final documentation
  link check pass **52/52**. Log:
  `.local-artifacts/api-selection-explanations-focused-final.log`.
- Final `npm test`: **786/787**, nonzero only on the existing Ajv
  `properties.__proto__` runtime-slot case. Build/workspace typecheck, lint, format
  and whitespace checks pass. The failure is retained without skipping the test
  or altering the OAS.
  Log: `.local-artifacts/api-selection-explanations-regression-final.log`.
- Original private OAS checks pass **39/39**, including selectors using unchanged
  original discovery metadata from all supplied snapshots. No business API call.
  Log: `.local-artifacts/api-selection-explanations-real-oas-final.log`.
- Strict independent three-tarball installation, public types and runtime pass
  with the new evidence exports and optional selector signature. No workspace
  symlink or declaration-check skip.
  Report: `.local-artifacts/packed-consumer/2026-10-18T02-48-43-275Z.json`.
- Actual Chomsky uses **two model calls**: discovery selection with a reason and
  separate OAS-typed argument generation. Deterministic single-API SDK composition
  executes **one local GET** in isolated n8n 2.37.10. Sources are three synthetic
  OAS documents, including identical paths with different document identities.
  This is not a real-business endpoint or general orchestration quality benchmark.
  No model retry, output repair or invented parameter occurs. Original artifacts:
  `.local-artifacts/api-selection-explanations/1792291461771-22669/`.

See [Korean API selection usage](api-selection-explanations.md). The next remaining
explanation boundaries include request media-type choice and the standalone
argument/binding/native/full-graph planners. General requirement supersession,
safe bounded stage reuse, broader model quality and the existing Ajv failure also
remain open. All additions are unreleased; no product commit, push or publish.

## Question ownership, exact-stage routing and wire exclusivity: previous checkpoint

Semantic edit questions now declare either a scoped independent semantic owner or
an actual selected planning decision plus its exact question-owning stage. Core
checks the zero-based decision reference, rejects self/cyclic/unknown or
non-planning targets, and verifies that the target actually owns that stage.
The reference is role identity, never workflow execution order. Repeated API roles
retain distinct allocated IDs and independent concern references.

`describeWorkflowDraftClarificationOwnership` preserves each declaration,
instruction, exact source evidence and optional explanation. Stage projections and
the host questions expose the code-resolved owners. Planning-owned concerns use
the real owner's existing typed results/questions instead of creating new
workflow-wide pending requirements. Missing API/native/requirement results still
block final assembly; genuine scoped semantic uncertainty remains unchanged.
No question is removed by text comparison, field-name matching or output repair.

Every adapter sends only the current step/stage's `planningClarifications`.
Direct owner stages are distinguished from dependent consumer repair phases.
A producer's downstream-repair labels cannot claim ownership of another API's
input question; actual input edits or code-derived consumer tasks own that work.
API literals belong to `api-arguments`, binding choices to `api-bindings`, native
settings to `native-parameters`, typed replacement fields to `requirements`,
and routing choices to `connections`. Owner metadata is retained in the full
plan/stage while filtered out of unrelated or later model inputs. This structural
boundary does not prove that an LLM's semantic classification is always correct.

Actual probes exposed two additional defects before the final source:

- The first owner-aware response correctly selected both owners but appended a
  whole-request `no-change` alongside the real edits. Core rejected it before
  execution. Artifact: `.local-artifacts/requirement-scope/1792289089446-15658/`.
  The shared Zod schema and actual wire JSON Schema now express exactly one
  no-change decision OR a nonempty list excluding no-change. The old redundant
  post-parse mixed-no-change check is removed. No item is silently discarded.
- The next four-call attempt accepted the typed API value, then asked for that
  value again during connection planning. Its stored API resolution already
  contained the value. Step-only concern routing had also forwarded the stale
  input question to the connection model. Artifact:
  `.local-artifacts/requirement-scope/1792289271448-16225/`.
  Exact-stage ownership/filtering replaces that broad routing; current actual
  values remain in the connection contract. The same user request is retained.

Full regression also reproduced an incidental-selector leak: a lower domain's
`stepId` spread into common staging became an ownership filter and replaced the
domain's original wrong-step error. Staging now projects only its declared plan
identity fields into the full ownership description. Negative domain contracts
are preserved, not weakened. The earlier unowned semantic-scope fixture is
explicitly migrated; production has no missing-owner default or saved-plan alias.

See [Korean question ownership usage](workflow-draft-clarification-ownership.md).
Final verification on 2026-10-18:

- Thirteen new tests cover owner identity, exact phases, real semantic blocking,
  repeated API roles, missing materials, original diagnostics, optional reasons
  and the actual wire schema's no-change exclusivity. Related suites and document
  links pass **92/92**. Log:
  `.local-artifacts/clarification-ownership-focused-final.log`.
- Full `npm test`: **772/773**, exiting nonzero only on the existing Ajv
  `properties.__proto__` runtime-slot case. Build, workspace typecheck, lint,
  format, documentation links and whitespace checks pass. No failing case is
  skipped; final log:
  `.local-artifacts/clarification-ownership-regression-final.log`.
- Original private OAS checks pass **38/38**, including original ICL identities
  with explicitly owned concerns and missing actual request inputs. The original
  OAS is unchanged and no business endpoint is called.
- Strict independent three-tarball install, public declarations and runtime
  checks pass, including owner descriptions and exact-stage declarations.
  No workspace symlinks or declaration-check skips. Report:
  `.local-artifacts/packed-consumer/2026-10-18T02-23-10-866Z.json`.
- The deterministic owned-concern conversation completes one plan and executes
  **one local GET request** in isolated n8n 2.37.10. Notes stay in the plan while
  typed questions disappear only after their actual explicit answers. Artifacts:
  `.local-artifacts/requirement-scope/1792290188841-19313/`.
- The unchanged actual Chomsky scenario completes the final source in **four
  model calls**, then executes **one local GET request** in isolated n8n. Exact
  owners are API arguments and requirement replacement; explicit no-binding,
  requirement fields, API literal and approvals are synthetic human UI actions.
  No output repair, model retry, human-answer invention or business call occurs.
  Import JSON/report/checkpoints:
  `.local-artifacts/requirement-scope/1792290192425-19293/`.
- Existing requirement-history n8n regression passes:
  `.local-artifacts/requirement-history/1792290187719-19304/`.
  Existing answer-revision n8n regression passes with **two local HTTP requests**:
  `.local-artifacts/draft-clarification/1792290188553-19308/`.

The successful actual-model case is an explicit one-API edit with an unchanged
native root, not a short-query, multi-service or all-explanations quality benchmark.
The two preceding actual failures above remain preserved. The initial regression
before stage projection was fixed is also retained separately:
`.local-artifacts/clarification-ownership-regression-before-stage-projection-fix.log`.
All additions remain unreleased and absent from npm 0.2.0. General requirement
supersession, every stage's optional explanation coverage, safe bounded stage
reuse, wider model quality and the existing Ajv special-key failure remain open.
No UI/server/database/direct deployment service is introduced.

## Selected identities and typed requirement scopes: previous checkpoint

A new public-host reproduction rejected a requirement scope pointing to a selected
API while its required path value was still missing. The host checked only
materialized `stage.content` IDs, even though the original plan already allocated
the identity. This mixed selection authority with request readiness.

Core now owns `describeWorkflowDraftSelectedNodes`, shared by clarification scopes
and `describeWorkflowDraftRequirementEdit`. It validates the original plan,
includes existing and allocated API/native identities and original replacement
contracts, and excludes removed nodes. It supplies no executable request values or
fabricated native outputs. `createWorkflowDraftRequirementAnswerSchema` derives
the actual ID enum for typed human answers. Candidate context, staging and assembly
re-derive that authority; a client-edited description is not trusted.

The canonical host question exposes `requirementEdit`, replacing the old
unreleased `draftRequirement` field with `requirementEdit.requirement` plus the
selected inventory. It uses Core's schema instead of a separate material-ID test.
Pending native prerequisites and API inputs continue to block their own stages
and final assembly. A confirmed scope does not supply a value, producer contract,
approval or execution destination.

The deterministic reference path first receives the API and requirement questions,
accepts explicit scope while retaining the pending API question and original
draft, then receives the typed path value and completes connection planning and
review on the same plan. It does not replay semantic, binding or argument models.
Without an explicit deployment URL, the final design remains valid but Start is
disconnected under the existing deployment contract. With the explicit isolated
server address, official SDK compilation and n8n execute the actual GET request.

Actual-model evidence is separate and **not an end-to-end pass**:

- First attempt: two returned model calls selected only the API and then a binding
  question. The conditional wording about revising purpose was treated as keeping
  the current purpose until a later answer. The test driver's assumed requirement
  question was absent and it stopped with a TypeError. Original checkpoint/failure:
  `.local-artifacts/requirement-scope/1792287798181-12435/`.
- The next explicit request required both API addition and requirement revision.
  One returned semantic call selected them, but also created two workflow-scoped
  generic questions for the same API literal and typed requirement answer. Core
  accepted the new allocated ID in the human requirement answer. The generic
  questions remained and correctly blocked later planning; the driver stopped
  because there was no actual API-input question to answer. Checkpoints/failure:
  `.local-artifacts/requirement-scope/1792287927508-12624/`.
- Both attempts made zero local/business HTTP requests and did not execute n8n.
  No model output was changed, missing answer guessed, generic question skipped
  or semantic plan repaired to obtain a green result. The test driver now checks
  for its required question explicitly and supports an explicit no-binding UI
  action if a real binding question is present. This is not a production fallback.

Final verification on 2026-10-18:

- Seven new scope tests pass. The related host/history/clarification suites and
  documentation link check pass **50/50**. Final focused log:
  `.local-artifacts/requirement-scope-focused-final.log`.
- Full `npm test`: **759/760**, exiting nonzero only on the existing Ajv
  `properties.__proto__` runtime-slot case. Build, workspace typecheck, lint,
  format, documentation links and whitespace checks pass. Product changes remain
  uncommitted and unpublished. Final full log:
  `.local-artifacts/requirement-scope-regression-final.log`.
- Original private OAS checks pass **38/38**, including an original ICL operation's
  pending selected scope. No OAS or API input is changed; no business API is called.
- Strict independent three-tarball install, declarations and runtime checks pass
  with the new public descriptors/schema and original ICL contract. No symlink or
  skipped declaration check. An initial verifier-only variable naming collision
  was corrected without changing the product API. Final report:
  `.local-artifacts/packed-consumer/2026-10-18T01-50-29-191Z.json`.
- Final deterministic same-plan requirement/API-input conversation passes SDK
  compilation and isolated n8n 2.37.10, with **one actual local HTTP request**.
  Original native node and edges remain unchanged. Artifacts/import JSON:
  `.local-artifacts/requirement-scope/1792288227854-13884/`.
- Existing requirement-history isolated n8n regression passes:
  `.local-artifacts/requirement-history/1792288228331-13887/`.
  Existing answer-revision regression also passes with **two local HTTP requests**:
  `.local-artifacts/draft-clarification/1792288228677-13893/`.

The local fixture is an explicit GET/typed-input scenario, not a production service
execution or short-query quality benchmark. Its initial test assumption that a
complete design without a deployment URL should connect Start was corrected to
the existing explicit deployment contract; no address default or safety bypass was
added. Neither actual-model failure above is counted as an execution pass.

The newly observed next gate is stage ownership of clarification: a generic
semantic question must not duplicate a question already owned by typed requirement
revision or OAS input planning and block independent materials. Do not solve it
by matching free-form sentences, filling dummy values, removing valid questions
after generation or repeatedly rephrasing the test until it passes. Complete
general semantic lifecycle, optional explanations, safe stage reuse, broader
quality and the known Ajv special-key issue also remain open. See
[selected scope usage](workflow-draft-requirement-edits.md).

## Requirement history, typed answer evidence and active planning views: previous checkpoint

Canonical drafts now require `requirementHistory`. Core derives creation,
revision, withdrawal and restoration entries from actual changes, exact source
messages, revision numbers and prior entries. Validation replays the chain and
checks the current requirements, snapshots and source quotes. Hash identities
check consistency; they are not signatures or authentication. No model writes
the journal, and missing historical data is not synthesized for old unreleased
saved drafts. Creating fresh content must omit canonical revision/approval/history
metadata; the relevant fixture projections now state that separation explicitly.

Current requirement `sourceMessageIds` contain the current request and explicit
typed replacement evidence, not an automatic union with all prior messages.
Earlier statements, scopes, sources and removals remain in the journal. Raw
withdrawal changes need explicit source IDs. A bounded model decision may select
only an existing requirement ID to withdraw; withdrawal does not delete workflow
nodes or edges. Conflicting revise/withdraw decisions are rejected.

`createWorkflowDraftEditCandidateContext` derives a canonical receipt from the
typed requirement resolution's required `answerMessageId`, text, state and scope.
It validates the original plan and selected step, rejects message ID conflicts,
retains the original planning evidence view/fingerprint and preserves the caller's
specialized capability types. Candidate assembly, preview and adoption use that
evidence context. The reference host uses the explicitly submitted action ID;
it does not re-run semantic selection to accept typed human fields.

`context.messages` retains declared audit sources. Optional `planningMessageIds`
selects the actual model/evidence input; omission retains the original nonempty
planning-message contract. This is an explicit view, not semantic text matching.
Changing one requirement never automatically retires its whole source message,
which may hold other still-current requests. The existing clarification receipt
lifetime remains host-owned. Excluded empty audit text remains valid and unchanged;
selected model text must be nonempty. Invalid declarations still fail with a
source-naming error rather than being silently replaced.

The new host test also reproduced a scheduling defect: an already resolved
requirement-only deferral stalled at an empty question screen. The scheduler now
checks blocked sources only when pending connection planning actually needs them,
after all real resolutions, repairs and questions are complete. The unchanged
deferred candidate is adoptable as review JSON with disconnected Start. Actual
unfinished material, repair and connection work still blocks completion.

Verification artifacts after final source changes on 2026-10-18:

- Eleven new feature tests plus the documentation link check pass **12/12**.
  The final related clarification/feature/documentation run passes **25/25**.
  Log: `.local-artifacts/requirement-history-focused-verified.log`.
- Full `npm test` passes **752/753**, exiting nonzero only on the existing Ajv
  `properties.__proto__` runtime-slot case. The initial final-source regression
  exposed a missing source name in an empty default-message error; the resolver
  now preserves that boundary diagnostic and its original Zod cause. No failing
  test is skipped or weakened. Final log:
  `.local-artifacts/requirement-history-regression-final.log`.
- Build, workspace typecheck, lint and format pass. All product changes remain
  uncommitted and unpublished, absent from npm 0.2.0.
- Original private OAS checks pass **37/37**, including requirement transitions
  over an actual original ICL contract. No original OAS, API values or response
  contracts are altered; no business API is called.
- Strict independent three-tarball installation, public declarations and runtime
  checks pass, including the journal and explicit active view. No workspace
  symlinks or skipped declaration checks. Report:
  `.local-artifacts/packed-consumer/2026-10-18T01-28-27-987Z.json`.
- Deterministic review, typed deferral and subsequent withdrawal pass isolated
  n8n 2.37.10. The deferred Start is disconnected, the final Start is connected
  and the original native material executes unchanged. Artifacts:
  `.local-artifacts/requirement-history/1792286907102-10303/`.
- Actual Chomsky completes the same two-turn semantic path in **two model calls**,
  followed by successful isolated n8n execution. Typed replacement fields and
  approvals are explicit synthetic UI actions, not generated human answers. No
  model retry, output repair or business API call occurs. Artifacts:
  `.local-artifacts/requirement-history/1792286910716-10297/`.
- The existing clarification answer-revision host/n8n regression passes with
  **two actual local HTTP requests**. Artifacts:
  `.local-artifacts/draft-clarification/1792286907667-10311/`.

The actual-model scenario changes only the purpose requirement of one existing
pass-through native workflow. It does not establish short-query quality, general
semantic entailment, automatic supersession of arbitrary facts or all-stage
explanation coverage. Safe stage reuse, broader real-model quality and the
existing Ajv `properties.__proto__` issue remain open. No UI, server, database or
deployment service is introduced. See the [Korean requirement-history guide](workflow-draft-requirement-history.md).

## Stable registered native definitions and host prerequisites: previous checkpoint

`resolveN8nNativePlanningFeatures` separates stable selection definitions from
materialized capabilities. The original resolver keeps its strict source-context
contract and exact return shape. Four material-dependent implementations share
their original structural schemas, reference locations, descriptions and ports
with planning definitions; no dummy source contract, output schema or compiled
name is constructed. Value-reference/output/compile calls require real binding.

Core now declares and validates `materialRequirements` and exposes
`describeWorkflowDraftNativeNodeAdditionReadiness`. The canonical host's optional
`nativeFeatures` configuration freezes implementation definitions before the plan.
A consumer selected before its producer waits without a model call, independent
work proceeds, and current source contracts are re-derived on the same plan.
Unfinished source prerequisites become typed `native-materials` questions; they
cannot be approved into an executable artifact. Full parameter, pointer, type,
snapshot, topology, review and SDK checks remain separate and unchanged.

The initial host inventory retains all registered families and explicit missing
context, including the host-owned JsonOutput schema. It is not a claim about the
current readiness of every selected workflow instance. Registered family identity
uses explicit `planningRegistrations`, not extension-name matching. Empty enum
selection and existing explicit capabilities retain their original meanings.

Self-review reproduced two new boundary defects before fixing them: prerequisite
arrays leaked mutations between registry results, and an explicit extension name
could impersonate a pending family in the host's availability projection.
Definitions now own separate prerequisite data and binding checks retain its
original value; family provenance comes directly from the registry. Reproductions:
`.local-artifacts/native-feature-planning-metadata-before-fix.log` and
`.local-artifacts/native-feature-planning-identity-before-fix.log`.

Original ICL verification also corrected a test assumption: a bodyless operation
cannot supply a collected response value. All 34 original contracts are checked,
with 33 bound and one bodyless collection rejected, rather than altering the OAS
or supplying a fake response body.

Final verification on 2026-10-18:

- Ten new feature tests and the documentation-link check pass **11/11**. Original
  registry/addition focused checks also pass. Full `npm test`: **741/742**, exiting
  nonzero only on the existing Ajv `properties.__proto__` runtime-slot case.
  Log: `.local-artifacts/native-feature-planning-regression-final.log`.
- Build, workspace typecheck, lint, format, documentation links and whitespace
  checks pass. Product changes remain uncommitted and unpublished.
- Original private OAS checks pass **36/36**, including every original ICL response
  contract and the bodyless negative case. No OAS, response or argument is changed.
- Strict independent three-tarball installation, declarations and runtime checks
  pass with public late-bound definitions and an original ICL operation. No
  workspace symlink or skipped declarations. Report:
  `.local-artifacts/packed-consumer/2026-10-18T00-48-40-036Z.json`.
- Deterministic consumer-first host composition passes isolated n8n 2.37.10.
  Independent work proceeds, producer settings resolve next, and the waiting split
  binds that actual output on the same plan. `[3, 1]` retains its number types and
  order, the marker remains literal text, and the independent root executes.
  Import JSON/results: `.local-artifacts/native-feature-planning/1792284519460-4882/`.
- Actual Chomsky completes the native-only host path in **four model calls**, then
  isolated n8n executes all three roles and emits the unchanged two items. No
  business API, output repair, inferred human choice or model retry is used.
  Artifacts: `.local-artifacts/native-feature-planning/1792284523524-4871/`.
  This explicit native-role scenario is not a short-query quality benchmark or
  proof that the model itself selected consumer-first ordering.
- Existing material-revision runtime checks pass all three cases, each with seven
  HTTP requests, unchanged duplicates/types, two distinct API roles and ancestry
  join. Artifacts: `.local-artifacts/native-material-revision/1792284519773-4876/`.

See [native definitions, prerequisites and host usage](native-feature-planning.md).
This does not complete general requirement supersession, every stage's optional
explanations, safe stage reuse, broader real-model quality or the original Ajv
special-key issue. UI/server/direct execution remain host-owned or deferred scope.

## Scoped API binding questions and direct answers: previous checkpoint

The previous actual-model failure showed a binding stage asking about another
operation's input contract. The unreleased binding output now contains typed
current-input questions rather than a free-form message. Model output may select
an unresolved input and actual source alternatives; core creates question wording,
original operation/target schemas, question IDs and source-choice labels/IDs.
Request-root patterns bound the wire schema, and complete original OAS pointer/type
validation preserves dynamic object keys, arrays and source contracts. No arbitrary
field enumeration, name-based mapping or additional whole-catalog prompt is used.

Definite mappings and multiple unresolved questions remain separate. Every proposed
alternative uses the same binding validator as a final mapping. Explicit human
answers may choose an actual alternative, specify a valid source directly or choose
no incoming binding. Partial answers expose no executable partial call. Ready
receipts retain the original proposal plus explicit answers and are re-derived
before argument generation; model output cannot supply human answers.

The canonical host exposes `api-binding` questions and `answer-api-bindings`.
Answers resolve the same original planning bundle without semantic, binding or
unnecessary literal-model replay. Other literal inputs, connection planning,
contract/DAG checks and final review retain their separate responsibilities.
Malformed, stale or incompatible answers leave the original plan untouched.
See the [typed question contract](workflow-draft-api-binding-questions.md).

Verification on 2026-10-18:

- Nine new tests pass: out-of-scope model failures retain original outputs without
  repair/retry; wire schemas reject foreign request roots and generated UI fields;
  original source/type/target checks, dynamic object/array pointers, partial answers,
  explicit no-binding and tampered/stale answers are covered. The host resumes the
  same plan; only the later connection model is called for the wholly-bound case.
- Final full `npm test`: **731/732**, with only the unchanged Ajv
  `properties.__proto__` runtime-slot failure. The command exits nonzero. Log:
  `.local-artifacts/api-binding-questions-final-regression.log`.
- Original private OAS checks pass **35/35**. ICL contributes twenty-four actual
  request roots across its selected operations and declared media choices; question
  creation and explicit no-binding preserve original OAS and invent no values.
- Strict independent three-tarball installation, declarations and runtime checks
  pass, including the new public typed question/answer contract. No workspace
  symlinks or skipped library declarations. Report:
  `.local-artifacts/packed-consumer/2026-10-18T00-16-21-039Z.json`.
- Build, workspace typecheck, lint, format, local documentation links and whitespace
  checks pass. Product changes remain uncommitted and unpublished.
- Deterministic host/SDK/n8n 2.37.10 execution passes an explicit **second** source
  choice of accountId instead of email. It resumes the original plan, makes no new
  semantic/binding/literal model call for that wholly-bound consumer, and executes
  two exact HTTP requests. Import JSON and original checkpoints:
  `.local-artifacts/draft-clarification/1792282580245-98949/`.
- Actual Chomsky completes the prior answer-revision scenario with **15 calls**,
  two explicit answer transitions and two exact n8n HTTP requests. The exclusion
  revision selects one API; explicit restoration selects two. This run needed
  **zero additional typed binding answers**, so it proves the full model/workflow
  path, not actual-model exercise of the new question branch. Original outputs:
  `.local-artifacts/draft-clarification/1792281445745-96537/`.
- A separate actual-model probe after API selection returns a real typed
  `/path/id` question with two compatible original sources. The synthetic operator
  explicitly selects the second, independent source. Deterministic binding and
  wholly-bound argument resolution finish with **one total model call**, no retry
  and no output repair. This probe does not execute a final graph or n8n. Artifacts:
  `.local-artifacts/api-binding-question-probe/1792282584354-98946/`.

A final edge regression reproduced rejection of a valid newline-containing JSON
property by the new `.*` pointer suffix. The schema now uses an all-character
suffix before unchanged original-OAS pointer validation; LF, CR, U+2028 and U+2029
regressions pass without character bans or normalization. Input-free operations
also omit the impossible question branch entirely instead of serializing a never
item schema. Final typecheck/full regression, original OAS, strict consumer, typed
answer/n8n execution and a fresh one-call actual-model question probe all pass at
their stated scopes (with the same one known Ajv full-suite failure).

After the user reported a VPN connection, a further actual-model question probe
passed with one model call and zero business API calls. The synthetic operator
explicitly chose the second source; binding and wholly-bound argument resolution
required no additional model call. Artifacts:
`.local-artifacts/api-binding-question-probe/1792282948895-99436/`.
This retry did not run a final graph or n8n, and success alone does not prove the
cause of the earlier connectivity interruption.

No business API calls, automatic retries, output correction or inferred human
choices were used. Earlier actual-model failures/pending questions remain preserved.
These are focused development checks, not a broad quality benchmark or a claim
that every natural-language request is now resolved correctly on its first attempt.

This bounds question ownership, not whether a model will ask an unnecessary valid
question. General requirement supersession, late native prerequisites, remaining
explanations, safe stage reuse, broad model quality and the original Ajv issue are
still open. This is not completion of the complete conversational goal.

## Explicit clarification answer revisions: previous checkpoint

Core now exposes a deterministic describe/revise/validate boundary for replacing
currently confirmed answers and reopening their original questions. Typed changes
use actual original question/choice contracts. Fingerprints bind the current
context and answer state. Unknown, duplicate, stale, malformed and no-op changes
fail atomically; the original round and context remain unchanged. Code derives
before/after facts, pending/deferred state, source retirement and an explicit
human-action receipt, without an LLM call.

The canonical host accepts `revise-clarification` at its actual review/question
boundaries. It archives previous planning work and transition receipts. Retired
answer receipts, original UI answer envelopes and previous revision messages stay
in the audit transcript but are excluded from every current model input, including
optional review suggestions and later clarification background. Reopening clears
the current candidate and asks the original question; it never restores an old
answer. An explicit later answer may reactivate an identical content-addressed
receipt, with its separate action history preserved.

This closes current-round answer replacement/reopening, not general fact or
completed-turn requirement supersession. Explicit changes still re-enter existing
planning and validation; safe fine-grained stage reuse remains open. Public usage
and ownership are described in the [answer revision guide](workflow-clarification-answer-revisions.md).

Verification on 2026-10-18:

- Eight new tests pass: atomic source-preserving replacement/reopening, original
  text/single/multiple-choice contracts, immutable receipts, model evidence exclusion,
  stale replies without model replay, restored answers, unchanged answers from mixed
  submissions, optional review follow-ups and later clarification background.
- Final full `npm test`: **722/723**, with only the unchanged Ajv
  `properties.__proto__` runtime-slot failure. The command exits nonzero. Log:
  `.local-artifacts/clarification-answer-revision-final-regression.log`.
- The strict consumer uses an original private ICL operation and exercises the new
  public types, revision creation and validation. Private OAS checks additionally
  reopen an answer without changing the OAS or inventing a replacement fact.
- The actual host/SDK/n8n 2.37.10 deterministic test excludes address lookup,
  reopens the question and explicitly restores inclusion. The final workflow makes
  two exact HTTP requests, with the follow-up input taken from the original response.
  Artifact/import JSON: `.local-artifacts/draft-clarification/1792279941538-93029/`.
- The existing follow-up adoption/n8n regression also passes with two exact requests:
  `.local-artifacts/draft-clarification/1792279942736-93043/`.

Final original private OAS checks pass **34/34**. Strict independent installation
of all three tarballs, public declarations and runtime checks pass without workspace
symlinks or skipped library declarations. Report:
`.local-artifacts/packed-consumer/2026-10-17T23-37-47-149Z.json`.
Build, final workspace typecheck, lint, format, documentation links and whitespace
checks pass. These checks are not a broad actual-model quality benchmark.

The first actual-model attempt returned all eleven calls, but asked again about
an answered/reopened question. Its ready clarification contained the accepted
inclusion fact while the previous reopen envelope remained current model evidence.
The attempt was explicitly cancelled with zero fixture/business requests; original
outputs remain at `.local-artifacts/draft-clarification/1792279551545-92425/`.
Ordinary replies and explicit revisions now share one evidence-lifetime transition:
superseded submission/reopen envelopes remain audit history only. Current per-question
receipts retain unchanged answers. No extra instruction, output repair or default
answer is used to bypass this ownership issue.

After that code change, the next actual-model attempt returned all nineteen calls.
It first legitimately requested an explicit address-owner source; the synthetic
operator specified accountId. Later, the binding model for **GET /seed/{seedId}**
asked for the address request schema and original member response schema. Those
belong to planning the address consumer, not the selected original lookup.
Reconstructing the trusted stage matched the original result fingerprint, proved
the selected `/path/seedId` contract existed, and confirmed the expired reopen
receipt was inactive. This is model planning-scope leakage, not a timeout or proof
that the selected OAS is missing. It was explicitly cancelled rather than repaired
or retried; no final actual-model workflow/n8n execution is claimed.
Artifacts: `.local-artifacts/draft-clarification/1792279787180-92822/`.

The model-clarification contract still accepts a free-form question. Constraining
that outcome to the selected operation and relevant input/source targets is a new
concrete quality gate. Sending every unrelated schema, silently applying a mapping
or repeating the same call would not establish a root fix. General requirement
supersession, late native prerequisites, explanations, safe reuse, broad model
quality and the original Ajv issue remain open. The full goal remains active.

## Review follow-ups and explicit adoption: previous checkpoint

Public core primitives now describe and validate a host-owned read-only review
projection, verify original sources, allocate review/suggestion IDs, and create a
distinct explicit user-adoption receipt. The LangChain adapter makes one bounded
call for optional suggested messages, actual question references and optional reasons.
Message evidence uses ID selection and code-owned original text. OAS evidence selects
a supplied candidate; native and pending-question sources use actual declared names/IDs.
Neither an unselected suggestion nor ordinary workflow approval changes intent.

The optional canonical host adds a separately checkpointed suggestion stage before
initial clarification, material selection, planning questions and final candidate
review. It validates original records inside replayed interrupt nodes, without
model replay. `adopt-suggestion` verifies the current token/review/suggestion IDs and
records model-proposed text as explicitly user-adopted, never as original human prose.
Each record also retains its original read-only target/questions after revision,
so historical question evidence is not reduced to a dangling ID.
It re-enters normal analysis and original contract/DAG checks, not an implicit patch.
Unselected related extensions are not requirements. Disabled configuration makes
zero follow-up model calls; automatic review still pauses only for actual uncertainty.

Revisions also preserve code-verified confirmed clarification answer receipts.
`confirmedAnswerMessageIds` is derived from actual non-deferred replies and validated
against the original round. Deferral is not carried as a confirmed fact. This closes
a specific answer-loss path, not the full requirement supersession lifecycle.
Prior work remains explicit history; fine-grained safe reuse is still open.

The integration driver now accepts further explicit UI interactions under an
explicit test budget rather than asserting that the first clarification round
must resolve all later questions. It neither chooses the first model suggestion nor
repairs returned proposals. Production host session/authorization limits remain
caller-owned. See the [review/adoption contract](workflow-review-suggestions.md).

Verification on 2026-10-18:

- Nine new tests pass: core budgets/evidence/identity/adoption, four actual ChatOpenAI
  wire option combinations, all four MemorySaver boundary kinds, stale/malformed
  replies without model replay, automatic review, cancellation and confirmed-answer
  retention. Optional/empty OAS and native-only review inputs are also covered.
- Full `npm test`: **714/715**, with only the unchanged Ajv `properties.__proto__`
  runtime-slot failure. The command remains nonzero. Log:
  `.local-artifacts/review-suggestions-final-regression.log`.
- Original private OAS checks **33/33** include ICL review/adoption without OAS
  mutation, invented values, execution or automatic workflow creation.
- Strict independent three-tarball installation, declarations and runtime checks
  pass with original private OAS; the new public adapter signature/core adoption
  contract are included. No workspace symlinks or skipped library declarations.
  Report: `.local-artifacts/packed-consumer/2026-10-17T22-57-42-943Z.json`.
- Deterministic host/SDK/n8n 2.37.10 passes an explicit second-choice adoption of
  accountId rather than email, further selection review, final review and two exact
  HTTP requests. It records seven suggestion rounds, one adoption and two extra UI
  interactions. Artifact/import JSON:
  `.local-artifacts/draft-clarification/1792277859289-89186/`.
- Actual Chomsky passes with **16 model calls**, five suggestion rounds and the
  same two exact n8n requests. This run resolved the address source without another
  material question, so it contains **zero adopt-suggestion actions and zero extra
  follow-up interactions**. It verifies real model suggestions and the full workflow
  path, not real-model exercise of the extra-adoption branch. That branch is covered
  separately by the deterministic test. Original outputs are unchanged. Artifacts:
  `.local-artifacts/draft-clarification/1792277313795-87699/`.
- After retaining original target snapshots, a fresh actual-model verification also
  passes with sixteen calls, five suggestion rounds, zero extra adoption interactions
  and the same two exact HTTP requests. Current artifact/import JSON:
  `.local-artifacts/draft-clarification/1792277911597-89343/`.
- An explicit invalid synthetic-output probe verifies the new review error family
  is persisted with its original output and proposal-schema stage after one call,
  without API execution. This is diagnostic retention, not a model quality result.
  Artifact: `.local-artifacts/draft-clarification/1792278214418-89639/`.

No business API, automatic model retry, source substitution or output repair was
used. These are development checks, not a quality benchmark or invented success
threshold. The original failed/pending actual-model attempts remain preserved.
Remaining gates include full supersession provenance, late native material/registry
prerequisites, remaining per-stage explanations, safe bounded reuse, broad model
quality evaluation and the existing Ajv issue. Product work is uncommitted and
unpublished; the full goal remains active.

## Structured clarification, scoped facts and host composition: previous checkpoint

Core now validates the original clarification round/resolution, derives explicit
reply-evidence receipts and exposes structured facts/questions separately from the
human-readable prompt. Fact/question identities, text, state and original lineage
remain code-owned. A bounded model selects only actual requirement scopes; pending
optional work may be explicitly unselected, without a fake API. Original unanswered
questions still block final adoption. Independent known work can be prepared first.

The canonical private host opts in through explicit `clarification` settings. It
checkpoints clarification, typed answers, semantic material selection, scopes and
material planning separately. Clear requests skip question interruption. Deferred
answers preserve the prior plan/results in audit history and explicitly reanalyze;
there is no automatic rebase or unsupported result reuse. Review/question payloads
expose original facts and scope receipts. Fresh suggestions at every boundary,
complete supersession lineage, safe fine-grained reuse and late native registry
prerequisites remain open.

An actual full-model run exposed a provenance ownership error: the final connection
model regenerated a quote from a JSON reply receipt without preserving JSON escaping.
The unchanged core exact-source check correctly rejected it. The recorded failure
is at `.local-artifacts/draft-clarification/1792274158623-81318/`; all eleven model
calls returned and no business or fixture HTTP request ran. It was not a network
timeout. The quote's absence from the original receipt was reproduced directly.

The adapters now use a shared Zod message-selection schema. The model chooses a
supplied ID; parsing attaches captured unchanged text before existing core checks.
Wire input has no quote field. Unknown IDs and extra quote fields fail, rather than
being repaired. Input-mode JSON Schema serialization is explicit for these evidence
schemas; other schemas retain output-mode serialization, including rejection of
unsupported native transformations before a model call. No business values are
coerced or rewritten. The direct core evidence contracts remain unchanged.

The host also validates the complete deployment registry before selecting only
actual selected document settings for compilation. This fixes registry ownership
without relaxing compiler checks or substituting another service's URL/credential.

The
actual model retry at `.local-artifacts/draft-clarification/1792275071827-83198/`
returned all ten calls, then asked whether address `query.owner` should use original
response `accountId` or `email`. The test driver expected a final candidate and
exited nonzero. The checkpoint contains a valid `draft-questions` boundary, not a
network/schema error or completed workflow. No value was guessed and no API ran.
This is a retained semantic clarification outcome, not a successful end-to-end
model execution. The deterministic host/SDK/n8n path is checked separately.

Final verification on 2026-10-18:

- New clarification/scope/host/deployment/evidence regressions: **21/21**. Quotes,
  JSON escaping, immutable captured sources, ID-only wire schemas, malformed/stale
  replies, actual scopes, unselected optional work, review/automatic policies and
  canonical origin are covered. Tests do not claim semantic entailment.
- Full `npm test`: **705/706**. The unchanged Ajv `properties.__proto__`
  runtime-slot case is the only failure; the command exits nonzero. Log:
  `.local-artifacts/draft-clarification-final-regression-verified.log`.
- Build, strict workspace typecheck, lint, format, documentation links and
  `git diff --check` pass. Original private OAS checks: **32/32**, including the
  original ICL snapshot, unresolved typed values and exact clarified-fact lineage.
- Strict independent three-tarball installation, declarations and runtime checks
  pass without symlinks or skipped library declarations. It uses original private
  OAS and covers the new scope API. Report:
  `.local-artifacts/packed-consumer/2026-10-17T22-17-55-104Z.json`.
- Deterministic full host/SDK/n8n 2.37.10 execution passes: explicit defer, independent
  preparation, explicit confirm, archived prior work, scoped facts, selection/final
  review and same-revision export. Two exact HTTP requests pass, with address owner
  supplied by the original response rather than the initial seed. Import JSON and
  evidence: `.local-artifacts/draft-clarification/1792275431292-84408/`.
- The existing five-API/IF/Merge/Pass-through runtime regression passes both routes:
  five HTTP calls when enabled and one when disabled. Artifacts:
  `.local-artifacts/api-response-sources/1792275617480-85298/`.

The actual-model extra-question path still needs a test driver that accepts further
explicit conversation replies instead of assuming one initial round resolves all
decisions. Its preserved question is a normal host HITL result, not authority to
infer a source field. There was no automatic model retry or output repair. Product
work remains uncommitted/unpublished and the full goal remains open.

## Selected API response declarations: previous checkpoint

The source registry previously enumerated prepared requests and excluded every
pending API addition/replacement. That conflated two different facts: an original
OAS response declaration is already known after selection, while request values,
execution ancestry and runtime data may still be unresolved. A consumer selected
before its producer could consequently ask an avoidable source question.

`stageWorkflowDraftEdit().apiResponseSources` now derives every actual selected API
response from the full original operation key. Prepared instances carry
`preparation: { status: 'request-planned', request }`; pending instances carry
`request-pending`, the actual step/role/instruction and **no request object**. No
request values, bindings, media choice, execution receipt or placeholder instance
is fabricated to make a response source visible. Replacements expose only the
new selected OAS response, never the old response as an implicit substitute.

API binding and native planners use this shared registry. Source request media is
not required to inspect a response contract; target request media still uses its
existing explicit OAS boundary. Requirement-blocked and self sources remain
excluded. New response declarations also drive consumer repair discovery before
request generation. Native consumers awaiting a repair do not publish their old
output; repaired native results bind actual selected source contracts. Final
assembly/export still requires all primary requests, explicit repairs, actual
ports and a valid dependency DAG. Knowing a response contract cannot authorize a
cycle or make a missing ancestor execute.

Verification on 2026-10-18:

- Eight new tests pass, including five pending original responses, consumer-first
  planning with zero consumer literal calls, IF before API requests, exact types,
  self/missing-pointer rejection, unresolved requirements, stale source contracts,
  early native repair discovery and final cycle/ancestry rejection.
- The actual MemorySaver host starts from an empty draft, selects IF/Merge before
  the APIs and the producer after all four consumers, and completes two simulated
  review approvals. It creates five APIs, three native nodes and ten explicit edges
  across two OAS documents. Only the root needs literal extraction.
- Full regression **684/685**. The unchanged existing Ajv `properties.__proto__`
  runtime-slot case is the only failure, and the command exits nonzero. Log:
  `.local-artifacts/api-response-sources-regression-2026-10-18.log`.
- Build, strict workspace typecheck, lint, format, focused tests and whitespace
  checks pass. Original ICL/private OAS checks **31/31** include two selected ICL
  response contracts before any request values, without modifying original OAS.
- Strict independent three-tarball installation/declarations/runtime checks pass,
  including the exported response-source type and pending-without-request shape.
  No workspace symlinks or skipped declarations. Report:
  `.local-artifacts/packed-consumer/2026-10-17T21-12-28-275Z.json`.
- Deterministic host/SDK/import/n8n 2.37.10 execution passes: true condition makes
  five exact HTTP calls using response account ID/email, false condition makes
  only the root call. Four different Merge inputs produce four unchanged typed
  output bodies. Artifacts:
  `.local-artifacts/api-response-sources/1792271543851-75938/`.
- Actual Chomsky passes the same scenario with ten model calls: semantic analysis,
  five binding decisions, one literal extraction, two native parameter decisions
  and final connection planning. Its original proposals are unchanged. It selects
  the root first; reverse planning order is covered separately by the deterministic
  regression, not claimed for this actual-model run. Both n8n runtime routes pass.
  Artifacts/import JSON:
  `.local-artifacts/api-response-sources/1792271592331-76196/`.
- Existing native material revision runtime regressions also pass for original,
  same-pointer changed type and renamed-pointer contracts. Each makes seven HTTP
  requests and preserves types, duplicates and item ancestry. Artifacts:
  `.local-artifacts/native-material-revision/1792271678598-76463/`.

No business API was called, no model retry/output repair or implicit connection
was added, and no success-rate threshold was invented. DAG independence here means
four distinct branches; it does not establish concurrent wall-clock execution by
the n8n engine. Existing request-readiness and topology failures remain failures.

At that checkpoint, initial clarification composition, suggestions at every HITL boundary, complete
requirement/fact/question provenance, late native registry prerequisites and broad
actual-model quality evaluation remain open. This closes selected API response
availability, not every unresolved native material case. Product changes remain
uncommitted and unpublished; the complete goal is still active.

## Canonical-draft conversation host: previous verified checkpoint

The [canonical conversation reference](workflow-draft-conversation-host.md) now
composes the existing public primitives in the private example workspace. It can
start from an explicit empty draft or accept later natural-language edits on a
completed draft using the same thread. It is not a new published package or a
mandatory OSS graph. The previous basic example and its initialization guard were
not loosened to treat completed state as fresh input.

Only the input channel accepts caller data. The first turn requires an original
draft; later turns cannot overwrite it. Code rejects reused message/request IDs
and stale expected revisions. Selection, original OAS/native contracts, binding
and literal stages, consumer repairs, connections, SDK preview and adoption have
separate named nodes. Each model stage is checkpointed before any interrupt node.
Code schedules available work; it never infers execution order from plan order.
Independent results stay pending while another step needs an answer.

`review` pauses for selection and candidate approval. Invalid/stale answers return
issues and re-enter through an edge, without replaying earlier model calls.
`automatic` still asks about unresolved work and does not fabricate human approval
records. At either boundary, an explicit new instruction supersedes the pending
plan without changing the canonical draft. Typed API answers use the actual OAS
contract and original proposal; existing requirement edits accept explicit
text/state/scope. There is no second value-extraction call merely to copy a typed
input answer. Native/structural questions remain visible and require an explicit
new instruction instead of guessed configuration.

Stage results preserve actual proposals, outputs and optional explanations/evidence.
Per-step material bundles retain their original planning snapshot. Final adoption
re-derives the candidate from original decisions and compares it to the preview;
review tokens cover the complete base draft and relevant pending/candidate state.
Only then are ready affected nodes approved and one revision exported as JSON,
Korean guide and slot inventory. A cancelled request does not relabel an earlier
artifact as its own result.

Verification on 2026-10-18:

- Fourteen actual MemorySaver host tests pass. They cover subsequent turns,
  repeated malformed/stale replies, cancellation, question-time supersession,
  typed input answers, independent work, empty/native-only drafts, thread
  isolation, original errors, optional explanations and requirement scopes.
- Full regression **676/677**. The existing Ajv `properties.__proto__` runtime-slot
  case is the only failure, and the command still exits nonzero. Log:
  `.local-artifacts/draft-conversation-regression-2026-10-18-final.log`.
- Fresh build, workspace typecheck, lint and documentation-link checks pass.
- Private original OAS checks **30/30**, including the new canonical host consuming
  original ICL OAS, preserving operation identity and deferring unknown values
  through actual typed runtime slots. Log:
  `.local-artifacts/draft-conversation-real-oas-2026-10-18-final.log`.
- Strict independent three-tarball install, declarations and runtime checks pass
  without workspace symlinks or skipped declarations. This covers the three
  public libraries, not installation of the private host example. Report:
  `.local-artifacts/packed-consumer/2026-10-17T20-52-10-564Z.json`.
- A deterministic host run passes three edit turns, six simulated UI approvals,
  revisions 2/4/6 and four executions in isolated n8n 2.37.10. Artifacts:
  `.local-artifacts/draft-conversation/1792269699301-70745/`.
- The first actual Chomsky run passes with eight model calls. The unchanged
  results insert an IF, edit only an existing API path value and remove the IF
  with original route restoration. Runtime checks verify matching/nonmatching
  branches, the exact changed value and unchanged unrelated values/settings.
  Artifacts: `.local-artifacts/draft-conversation/1792269820718-70932/`.
- A fresh verification stops at a genuine model question about IF `and`/`or`
  configuration. This was not a network failure; no final adoption or execution
  occurred. The raw checkpoint and failure remain at
  `.local-artifacts/draft-conversation/1792270331004-72222/`.
- After the user's explicit VPN retry request, another fresh run passes the same
  unchanged three-turn scenario with eight actual model calls, six simulated UI
  approvals and all four n8n executions. No output repair or automatic retry was
  used. Artifacts and import JSON:
  `.local-artifacts/draft-conversation/1792270535779-72678/`.

The first private-host fixture failed because it omitted explanations while the
default analysis contract required them. The fixture now explicitly disables that
optional feature; separate host tests retain explanation coverage. Its media
callback also reads the actual media-selection payload before attempting to read
the different message-based payload. Neither fix modifies the OAS, production
schema, model answer or assertion strength.

These are development smoke checks, not a success-rate benchmark. No business API
was called. The successful explicit retry does not erase the earlier clarification
pause. At that checkpoint, initial clarification composition, HITL suggestions,
complete fact/question provenance, late registry prerequisites and all-selected
planning-source availability remained required gates. The newer response-source
checkpoint above separates selected API declarations from request readiness;
unresolved native prerequisites and the other gates remain open. Product changes
are uncommitted, unpublished and absent from npm 0.2.0.

## Selected API addition/replacement: previous verified checkpoint

The [selected API planning boundary](workflow-draft-api-call-planning.md) fills the
prerequisite used by the canonical host above. It resolves one selected
original OAS operation, generates only exact source mappings and then only
remaining OAS-typed literal values. IDs, full operation keys, snapshot identity,
binding kind, schemas, evidence text, missing-input contracts and final workflow
JSON remain code-owned. Replacements retain identity, not previous same-name
values; unrelated calls, native settings and routes are preserved. Repeated roles
and operation-reference collisions across different OAS documents are tested.

Binding-owned and confirmed-input-owned fields are excluded from the actual
literal schema, including nested fields. No-input operations make zero model calls;
fully owned literal inputs make zero argument calls. Missing values return typed
questions without a request resolution, or explicitly opted-in runtime slots
without dummy request data. Stale/edited binding receipts and changed settings
are rejected before adoption. Connections and consumer repairs remain explicit.

Actual model testing exposed two incorrect wire-contract choices. A known-empty
mapping list used `z.never()`, whose `items.not` representation was rejected by
Chomsky with HTTP 400. The no-source schema now omits the already known field and
code constructs the empty canonical bindings. The next request showed that strict
JSON Schema requires all literal properties, conflicting with intentional omission
of unknown OAS values. The new literal stage now uses the same primary
`functionCalling` transport as `generateApiArguments`, with `strict: false` and
unchanged local Zod/full-OAS validation. No null sentinel, modified OAS types,
automatic transport fallback, model retry or output repair was added.

Retained initial failure directories:
`.local-artifacts/api-call-planning/1792267584488-65856/`,
`.local-artifacts/api-call-planning/1792267630429-66032/` (one explicit diagnostic
attempt), and `.local-artifacts/api-call-planning/1792267799493-66603/`.
Bounded provider messages and the exact fixes are recorded in
`.local-artifacts/api-call-planning/provider-schema-rejections-2026-10-18.json`.

Verification on 2026-10-18:

- Full regression **662/663**. The existing Ajv `properties.__proto__` runtime-slot
  case is the only failure; the command exits nonzero. Log:
  `.local-artifacts/api-call-planning-regression-2026-10-18-verified.log`.
- Fourteen new unit/actual local ChatOpenAI wire checks cover ownership, exact
  types, source availability, repeated roles, multiple OAS, media selection,
  questions/runtime opt-in, transport schemas and retained original errors.
  Fresh build, workspace typecheck, lint, format and whitespace checks pass.
- Private original OAS checks **29/29** pass, including an actual ICL-backed API
  addition with typed deferred inputs and the unchanged original OAS snapshot.
- Strict independent three-tarball installation/declarations/runtime checks pass,
  including the new public API planning signatures and real ICL values. No
  workspace symlinks or skipped declaration checks. Report:
  `.local-artifacts/packed-consumer/2026-10-17T20-11-56-341Z.json`.
- Deterministic SDK/import/isolated n8n 2.37.10 addition and replacement both pass:
  four requests for an added source-bound call and three for a replaced call.
  Unrelated values/settings/routes are compared unchanged. Artifacts:
  `.local-artifacts/api-call-planning/1792267401383-65365/`.
- Actual Chomsky-generated binding/connection decisions pass both runtime paths
  without proposal repair: four model calls, zero literal-generation calls when
  the source binding owns all inputs. Artifacts/import JSON:
  `.local-artifacts/api-call-planning/1792267435911-65551/`.
- After correcting both wire contracts, an actual no-source literal-only root
  passes binding choice, OAS-typed value extraction, explicit keep-connections
  and n8n execution. Three model calls; exactly one synthetic request with the
  unchanged string `literal-id`. Artifacts/import JSON:
  `.local-artifacts/api-call-planning/1792267916568-67249/`.

Across this checkpoint there were eleven actual model request starts: four for
the successful source-bound cases, four across the three retained failed/diagnostic
attempts, and three for the successful literal-only case. Three requests were
rejected with HTTP 400. These are development verification attempts, not an
independent quality benchmark. No business API was called.

At this earlier checkpoint, completed-plan composition and review/adoption policy
were not implemented. The canonical host checkpoint above adds that composition;
requirements lifecycle, suggestions and broader stage explanation coverage remain
open. Product changes are uncommitted and unpublished; the remaining gates have
not been replaced by these narrower checks.

## Native additions and interrupt replay: previous verified checkpoint

The [selected native addition boundary](workflow-draft-native-node-addition.md)
closes one prerequisite discovered while inspecting the still-unfinished completed-plan
host. Semantic analysis selects the capability and code allocates the new ID; the
new core/LangChain stage generates only implementation-typed settings, explicit
supported runtime ownership or a question. Actual material contracts, source
references, original validation and staged freshness are checked without inventing
settings. Closed empty settings are resolved by code with zero model calls. Shared
source evidence attaches original text/contracts from selected IDs, not model quotes.
Original values and connections remain unchanged until explicit connection deltas
are supplied and a candidate passes atomic assembly.

The initial example inspection also found `while (true)` interrupt validation inside
operation/input question nodes. The installed LangGraph 1.4.19 and current official
guidance use one interrupt per invocation: invalid-answer issues are returned to
state, checkpointed and re-entered through an edge. Both question nodes now use
that flow, expose typed resume-schema metadata and clear consumed request answers.
Repeated invalid replies are checked against actual `MemorySaver` state and task
interrupt histories, without rerunning earlier model calls.

This is progress toward the full host, not its completion. API-instance planning,
requirements lifecycle, review/adoption policy, suggestions and the official
completed-plan edit/resume composition remain open. The existing initialization
guard has not been removed to pretend generated state is a new conversation.
The first actual Chomsky attempt failed before model invocation with token-host
DNS `ENOTFOUND`. After the user connected the VPN, a fresh attempt passed with
exactly two model calls: IF settings and explicit connection planning. No model
retry, proposal repair or business API call was used. The unchanged result was
compiled with the SDK, imported into isolated n8n 2.37.10 and executed for matching
and nonmatching data. The guarded API ran only for matching data (three requests
versus two); the independent root ran in both cases. Exact decisions, executions
and import JSON: `.local-artifacts/native-node-addition/1792266659391-62153/`.

Verification on 2026-10-18:

- Full regression: **648/649**. The existing Ajv `properties.__proto__` runtime-slot
  case is still the only failure, and the command exits nonzero. Log:
  `.local-artifacts/native-node-addition-regression-2026-10-18.log`.
- Fresh build/workspace typecheck, lint and format checks pass. New tests cover
  selected-native settings, real local ChatOpenAI wire schemas, recursive Zod
  contracts and repeated invalid replies through actual `MemorySaver` interrupts.
- Private original OAS checks: **28/28**, including an ICL-backed native addition
  and explicit connection with the original API/OAS snapshot retained. Log:
  `.local-artifacts/native-node-addition-real-oas-2026-10-18.log`.
- Independent strict three-tarball installation passes without workspace symlinks
  or skipped declaration checks, including the public fixed-empty addition path
  with zero model calls. Report:
  `.local-artifacts/packed-consumer/2026-10-17T19-51-20-972Z.json`.

The successful VPN retry resolves this checkpoint's provider connectivity gate.
It does not establish complete conversational host support or general model quality.
Product changes remain uncommitted and unpublished; the full goal remains open.

## Native material snapshot repair: previous verified checkpoint

The [material snapshot boundary](native-material-snapshots.md) now resolves actual
API/native source contracts in dependency order. Original and candidate content
use the same immutable capability definitions but different bound material
snapshots. A reference awaiting an explicit repair has no declared new output;
dependent contracts remain pending while independent known outputs stay available.
Only actual new source contracts can create the next output contract and trigger
downstream consumer tasks. No old schema, guessed pointer, implicit acknowledgment
or new LLM schema-generation responsibility is used.

Array/collection/item-join factories implement a pure contract-binding protocol
with source receipts. Core checks those receipts and full parameter/output
contracts, including the final complete registry. The n8n adapter separately
resolves actual SDK producer exit names; existing compiled-source and ancestry
guards remain in force. An inconsistent caller compiler override is rejected,
not silently replaced by the factory's old compiler. Explicit coherent extensions
retain their behavior and the existing malicious-compiler regression assertions.

An initial actual n8n run failed before its first follow-up because template
requests had no way to select linked item readers. The template boundary now
accepts the existing explicit `itemMode: 'linked'` semantics and passes it to
request materializers. Single-item mode remains unchanged, and ambiguous streams
still fail. This is an explicit execution setting, not pointer/type guessing or
an automatic failure-triggered fallback. Failed execution:
`.local-artifacts/native-material-revision/1792263833466-52567/failure.json`.

The next isolated n8n 2.37.10 run passed original, same-pointer type-change and
renamed-field cases. Each executes seven synthetic requests through nested array
splits, two distinct roles of one API, an ancestry join and collection. Actual
per-node output checks preserve three items, duplicate values, exact string/number
types, original edges and full contracts. Artifacts/import JSON:
`.local-artifacts/native-material-revision/1792264894061-57835/`.
This is deterministic public edit/repair/SDK/runtime evidence, not a new actual
model quality evaluation or a claim of wall-clock concurrent n8n execution.

The current source fix supersedes the unresolved status in the historical
investigation below. Final verification on 2026-10-18:

- Eight new material-snapshot tests and one explicit linked-template regression
  pass. Full regression is **632/633**; the only remaining failure is the existing
  Ajv `properties.__proto__` runtime-slot case. The command exits nonzero; this is
  not a clean full-suite result. Log:
  `.local-artifacts/native-material-revision-regression-2026-10-18-verified.log`.
- Fresh build/workspace typecheck, lint, format and whitespace checks pass. The
  documentation-link regression includes the new snapshot guide.
- Private original OAS checks **27/27** pass. The separate strict three-tarball
  consumer verifies actual ICL material rebinding, current collection output and
  unchanged original receipts without workspace symlinks or skipped declaration
  checks. Report:
  `.local-artifacts/packed-consumer/2026-10-17T19-21-34-659Z.json`.
- New isolated n8n material-revision cases **3/3** pass. The existing draft-edit
  paths **12/12** also pass, including expected early failures with exact request
  counts, literal/media/reference/connection edits and both IF outcomes. Existing
  paths: `.local-artifacts/draft-edit/1792264609893-56092/`.
- Earlier regression runs exposed existing test-only compiler overrides without a
  coherent new binder and changed error ordering. Extensions now explicitly
  preserve the test compiler at every binding; original guard assertions are
  retained. Missing materials report node, capability and source, while malformed
  reference errors retain the original cause and precise location. Collection
  tests distinguish legitimate current-contract rebinding from a compiled reader
  declaring a mismatched source; the latter still fails the original export guard.

No new model or business API calls were made in this checkpoint. The special-key
Ajv failure, broader actual-model cascade evaluation, new-instance planning and
completed-plan LangGraph host composition remain open. Product changes remain
uncommitted and unpublished; the complete goal is not achieved.

## Native material snapshot investigation and structural prerequisite (historical checkpoint)

A later actual public staging/repair/assembly reproduction retains a string-item
output contract after the source operation changes to number items at the same
pointer. The n8n adapter's existing source-contract guard correctly rejects export
before runtime; this was not an incorrectly executed workflow. A renamed pointer
also fails with the old factory, while replacing the shared factory before planning
invalidates original-draft lookup. Evidence:
`.local-artifacts/native-material-refresh-repro/1792261010271-47738/report.json`.

`inspectNativeReferenceStructure` now separates literal reference-location inspection
from full source/output validation. Material-dependent implementations explicitly
provide `referenceStructureSchema`; physical location validation is shared with the
existing fully checked description API. Unknown source identities can be described
as unresolved while their original full schemas/output factories still reject them.
Defaults, coercion, transformation, malformed pointers, identity mismatch, runtime
ownership and invented locations fail. This does not yet connect new snapshot
resolution to staging/repair/compilation. The original material refresh bug remains
open, and the complete goal is not achieved. See the [structural contract](native-reference-structure.md).

Structural-boundary verification: four new tests and related native/reference/
registry/item-join/documentation checks **41/41**; full regression **623/624**, with
only the unchanged special-key Ajv failure. Fresh build/workspace typecheck, lint,
format, links and whitespace checks passed. Private OAS checks **27/27** and the
independent strict three-tarball consumer passed; its actual ICL-backed collection
can expose an unresolved structural reference while the full schema rejects that
source. Final installation report:
`.local-artifacts/packed-consumer/2026-10-17T18-25-36-188Z.json`.
Existing isolated n8n paths **12/12** also passed:
`.local-artifacts/draft-edit/1792261533911-49219/`.
Those runtime paths verify preservation of existing behavior, not the unresolved
material-refresh scenario. Updated deterministic reproduction, including successful
structural inspection under the new registry while original lookup still fails:
`.local-artifacts/native-material-refresh-repro/1792261563299-49518/report.json`.
No additional model or business API request was made for this structural step.

## Native consumer reference repair checkpoint

The [native consumer repair boundary](workflow-draft-native-reference-repairs.md)
adds one bounded source-choice call for an actual pending consumer task. Native
implementations declare exact producer/value-pointer locations; the generic core
does not search parameter names or string values. IF/assertions, array/collection,
item-join, exclusive rejoin and reference-free families all declare metadata.
Locations are checked against actual reference callbacks and settings. Shared
physical settings form a deterministic repair scope and conflicting assignments
fail. Distinct fixed pointers sharing a producer retain distinct code-owned keys.

The model returns one `bind`, `keep` or question per fixed key. Code owns patches,
task identities and full validation. Actual source kind, OAS/native pointers,
exclusive-control sources, provenance, unchanged parameter semantics and staged
freshness are checked. Questions return no partial repair and cannot conceal an
invalid explicit keep/bind. API/native edit stages share source availability;
native outputs awaiting repair are not presented as confirmed new contracts.
Manual custom repairs without location metadata retain their prior contract,
but cannot use this bounded model API without an implementation declaration.

One later actual-model attempt selected the correct pointer but falsely cited
OAS pointer text as user speech. The original proposal was rejected and retained
unchanged. This exposed an unnecessary generation task: the model was rewriting
known source text. The new repair proposal selects current message/source IDs
only. Code constructs exact message/OAS-root/native evidence and returns resolved
decisions separately from the original proposal. The output schema has no quote
field and does not ask the model to build operation identities or OAS citation
pointers. This is an explicit new contract, not citation correction, an alias or
automatic rejection retry. Other older edit planners still use their existing
quote contract; a shared evidence migration remains a separate improvement.

This checkpoint does not finish material-dependent registry refresh. Array,
collection and item-join factories still capture supplied source contracts. Their
location metadata is covered, not complete cross-revision schema refresh/runtime
repair. New native instances, operation replacement stages and the official
completed-plan LangGraph edit/resume/review composition remain open goal gates.
No old-schema fallback, guessed mapping or relaxed validation is introduced.

Verification on 2026-10-18 for this checkpoint:

- Focused native repair/settings, API binding, assembly and documentation checks
  **60/60**, including **12** new repair tests. Actual local ChatOpenAI HTTP
  requests cover both explanation modes, fixed reference keys, real source enums,
  selected message IDs and absence of quote fields. Full regression **619/620**;
  only the unchanged `properties.__proto__` Ajv runtime-slot failure remains.
  Fresh build/workspace typecheck, lint, format, links and whitespace checks pass.
- Original private OAS regression **27/27**, including an actual ICL operation
  replacement with explicit root-reference acknowledgment and unchanged settings.
  Independent three-tarball installation verifies strict public declarations and
  actual ICL repair/SDK compilation, with no workspace symlinks or skipped library
  declarations. Final report:
  `.local-artifacts/packed-consumer/2026-10-17T17-46-24-878Z.json`.
  The first new consumer fixture incorrectly read `operationRef` from a contract
  instead of its actual `key`; that fixture failed typecheck and was corrected.
- Isolated n8n **12/12** paths, including the same repaired IF graph with both
  matching and nonmatching actual replacement responses. The expected value,
  operator, stop message and routes remain unchanged. Matching executes three
  requests and joins; nonmatching executes one and intentionally stops before
  follow-ups. Final report/workflows/per-node executions:
  `.local-artifacts/draft-edit/1792259182378-45755/`.
- Final actual Chomsky run makes **3** requests: IF reference, assertion reference,
  then API binding repair. Code changes only two response pointers and one binding;
  unchanged settings/edges are asserted. Generated SDK JSON executes three local
  contract requests, selects the true IF output and passes the assertion in n8n.
  Artifacts including import JSON:
  `.local-artifacts/draft-native-reference-live/1792259181424-45744/`.
  Development attempts total **7** model requests (3 successful initial calls,
  1 rejected fabricated citation, 3 successful calls after the explicit evidence
  contract change). Rejected output:
  `.local-artifacts/draft-native-reference-live/1792258807897-44328/failure.json`.
  No model/API output was edited into a success and no automatic retry was added.
- Business API calls **0**. These cases do not establish broad model reliability,
  material-dependent array/item-join repair or completed conversational host behavior.
  Product changes remain uncommitted and unpublished. The full goal remains active.

## Native parameter edit checkpoint

The [native parameter-edit boundary](workflow-draft-native-parameter-edits.md)
adds independent target selection and typed value generation for an unfinished
`revise-native-node` step. Core derives field contracts/IDs from the actual
registered implementation and staged source instances. It preserves unpatched
values/identities, rejects invalid or stale receipts, checks original Zod
refinements and actual response/native pointer declarations, and returns scoped
questions rather than partial resolutions. Removal-only work makes zero value
calls. Whole-object runtime ownership requires explicit opt-in and implementation
support; re-entering literal ownership requires actual full parameters. No port
rewiring, consumer repair or output-schema invention is performed automatically.

This implements existing-node parameter revisions, not new native-instance model
composition, material-dependent consumer repair/registry refresh or the conversational
host. Bounded consumer reference models were added in the later checkpoint above.
API/native edit ordering is shared; final atomic assembly remains authoritative
for the complete graph and approval invalidation.

Actual Chomsky validation exposed three transport mistakes in succession. A
valid JSON Schema used generated absolute references that the server rejected as
remote; direct local paths into a large shared resource were then rejected as
unresolved components; named components with generated `type`/`description`
siblings next to `$ref` were also rejected. First failures and schema snapshots
remain in `.local-artifacts/draft-native-parameter-live/` under runs
`1792255680197-36874`, `1792255760907-36986`, `1792256055386-37600` and
`1792256278865-38150`. The diagnosis reused one original validated target result
explicitly; no product retry or silent provider/dialect fallback was added.

The owner of model-schema composition now emits reachable static schemas as
direct named `$defs` components. Descriptions/types live on the actual definition.
Only the provably identical type metadata generated by projection code is removed
from its reference wrapper; original `$ref` sibling assertions remain intact.
Unused definition annotations are not sent. Original resources/runtime constraints
and const/enum/default/example data remain unchanged. Static recursive references
retain graph links; unsupported dynamic scope is rejected visibly by this static
transport compiler, without changing OAS intake. The same construction defect
existed in API edit values, so that owner uses the shared component compiler too.

Verification on 2026-10-18:

- Native edit/wire tests **14/14**, static reference bundle tests **2/2**; combined
  with existing API edit/wire checks **28/28**. Actual local ChatOpenAI HTTP requests
  inspect both explanation modes, direct declared component links and typed output
  rejection. Original refinements/default rejection, recursive schemas, runtime
  ownership, scoped questions, stale state and explicit obsolete-port deletion are
  covered. One first-run test supplied an invalid empty edit list while expecting
  an already-completed error; its fixture now supplies an actual explicit edit.
- Full `npm test` **607/608**; only the existing `__proto__` Ajv failure remains.
  Workspace build/typecheck, lint, format, links and whitespace checks pass.
- Actual Chomsky native revision: final successful run uses **2** model requests
  (targets then values), with exactly `/conditions/0/operator = notEquals`.
  Original API values/edges remain identical. Isolated n8n executes **3** requests
  and succeeds before the edit; after the edit it executes **1**, skips follow-up
  APIs and intentionally ends in StopAndError. Artifacts:
  `.local-artifacts/draft-native-parameter-live/1792256424480-38605/`.
  Including diagnosis/development failures, native model request attempts total
  **9**, including **4** HTTP 400 rejections. This single explicit edit is not a
  broad model quality measurement or complete host conversation.

- Original private OAS regression **26/26**. Independent three-tarball consumer
  passes strict types/real ICL compilation, including runtime-to-literal native
  settings with preserved API bindings/edges. Report:
  `.local-artifacts/packed-consumer/2026-10-17T17-02-22-952Z.json`.
- Final isolated n8n regression **10/10**, now including the native operator edit
  through actual parameter resolution and atomic assembly. Report/workflows/node
  traces: `.local-artifacts/draft-edit/1792256539178-39162/`.
- Actual Chomsky API edit also passes **2** calls through the same corrected
  transport: exact-source numeric body count `4`, preserved other inputs/edges,
  validated atomic candidate and SDK JSON. This separate case executes no n8n
  workflow; runtime behavior is covered by the isolated integration above.
  Artifacts: `.local-artifacts/draft-api-edit-transport-live/1792256538213-39152/`.
  Across native diagnosis and final native/API checks, total model request
  attempts are **11**, including **4** HTTP 400 rejections.

No business service is called. Native consumer-repair/new-instance models,
material registry refresh, complete host lifecycle and broad model quality remain
unfinished, as do mixed runtime fields, full evidence/suggestion coverage and the
special-key policy. Product changes remain uncommitted/unpublished; the full goal
stays open.

## Connection edit checkpoint

The [connection-edit boundary](workflow-draft-connection-edits.md) adds core
`describeWorkflowDraftConnectionEdit` / `resolveWorkflowDraftConnectionEdit` and
one bounded LangChain `planWorkflowDraftConnectionEdit` call. Code derives actual
ports, response/native references, join and exclusive-output contracts from staged
materials. Whole-graph connection work waits visibly for pending primary results,
consumer repairs and unresolved decisions, without invoking a model or fabricating
completed materials. Independent material work remains available through staging.
Missing execution-time values remain typed slots and do not block graph planning.

Only explicit add/remove decisions, exact current-request quotations and optional
display explanations are generated. Output endpoint/port pairs and editable old
edge IDs are constrained to actual materials. Unrelated edges, node identities,
inputs and bindings are retained. Removed nodes and obsolete native ports require
explicit old-edge deletion; no automatic cleanup, port substitution, Merge insertion
or data conversion is added. Batch ownership is the union of connection-owning
semantic steps, not proof of per-edge semantic attribution. Questions return no
partial candidate. Ready candidates pass existing complete atomic assembly,
including every-route availability, exclusive joins, cycles, impact and approval
invalidation. Explicit keep of unchanged content preserves the revision.

Verification on 2026-10-18:

- New connection checks **17/17**, plus documentation link check **1/1**. The actual
  local ChatOpenAI HTTP test sends six requests across real Merge ports, node
  removals and an empty remaining graph in both explanation modes. Native-only,
  runtime slots, obsolete-port edits, scoped approvals, stale state, invalid sources,
  cycles and exclusive joins are covered. Two first-run failures were malformed
  test fixtures (canonical revision fields in content; wrong existing IF parameter
  shape), corrected to the original contracts without weakening product checks.
- Full `npm test`: **591/592**; only the existing special `__proto__` Ajv failure.
  Fresh workspace build/typecheck, lint, format and whitespace checks pass.
- Original private OAS regression **26/26**. Independent three-tarball consumer
  additionally compiles public connection-model types and actual ICL native-output
  binding/connection edits through the SDK, without symlinks or skipped library
  checks. Report: `.local-artifacts/packed-consumer/2026-10-17T16-24-55-848Z.json`.
- Actual isolated n8n 2.37.10 **9/9**: seven previous cases plus IF true with two
  outgoing branches, three API executions and Merge output of two items, and IF
  false with one API execution, no follow-up requests and StopAndError. Report:
  `.local-artifacts/draft-edit/1792254292231-33209/report.json`; the same folder
  includes importable workflows, explicit plans/deltas and nine per-node execution
  traces. All use the synthetic contract server; business service calls **0**.
- Chomsky token connectivity recovered. One actual model call for a Korean request
  to retain source → follow and move independent after follow generated exactly
  one added edge. The resulting SDK JSON executed in isolated n8n with observed
  requests in the required source → follow → independent order. Model calls **1**,
  business service calls **0**. Report and actual proposal/workflow/execution:
  `.local-artifacts/draft-connection-live/1792254422347-33936/`. This explicit
  single request is not a broad quality result or complete conversational test.

Native-setting models, complete new-operation composition, material-dependent
registry refresh, host scheduling/requirement/question lifecycle and official
LangGraph review/resume remain unfinished. Mixed-field native runtime slots,
complete evidence/suggestion coverage and special-key policy also remain open.
Product changes stay uncommitted/unpublished; the complete OSS goal stays active.

## Staged API binding edit checkpoint

The [binding edit boundary](workflow-draft-api-binding-edits.md) adds
`stageWorkflowDraftEdit`, `describeWorkflowDraftApiBindingEdit`,
`resolveWorkflowDraftApiBindingEdit` and one bounded LangChain
`planWorkflowDraftApiBindingEdit` call. Completed results are re-derived without
pretending missing steps are complete. Pending replacements/native changes and
scoped unresolved decisions do not expose their old source contracts. Complete
preparation/atomic assembly keep their original required-result checks.

An unfinished `revise-api-bindings` step and a code-derived consumer repair use
the same scoped mechanism. The model chooses only requested pointers, actual
producer instances and ownership actions. Source-instance inputs/bindings, scoped
requirements, background context and pending source changes distinguish roles;
only current-request evidence authorizes an edit. API/native output declarations
remain code/implementation-owned. No field-name, array-order, envelope, literal,
transformation or source-contract fallback is added.

`replace-literal-with-binding` explicitly authorizes the exact visible literal
removal; plain `bind` cannot clear it. `unbind` does not generate a replacement
value. Repair scopes must explicitly decide every affected target once and may
acknowledge a still-valid mapping with `keep`. Ambiguity returns scoped questions
without a partly applicable resolution/repair. Source/target membership, exact
provenance and declared types use shared existing checks; neither single-assignment
validation nor a ready stage result is proof of whole-DAG/runtime compatibility.
Final atomic assembly still owns ancestry, cycles, complete contracts and approval
invalidation. Connection edits are never automatically applied by this function.

A regression reproduced an actual resolver defect: `keep` plus a question about
another target returned questions before validating the kept pointer against a
changed producer. Explicit kept mappings now pass the same actual contract check
before any question return. No pointer is substituted or dropped. Evidence:
`.local-artifacts/2026-10-17-draft-api-binding-edit-keep-question-regression.json`.
An earlier HTTP test expected singleton `const` where Zod actually emitted a valid
singleton `enum`; only that test expectation changed, retaining membership and
meta-schema assertions. This was not a product-schema failure or upstream 400:
`.local-artifacts/2026-10-17-draft-api-binding-edit-first-wire-test-failure.json`.

Latest verification on 2026-10-17:

- New binding/staging checks **18/18**; combined edit/clarification-wire/docs
  focus **61/61**. The actual ChatOpenAI local HTTP test covers primary, repair
  and zero-source contexts in both explanation modes with six scripted requests.
- Full regression **574/575**; only the unchanged special `__proto__` failure.
  Fresh build/workspace typecheck, lint, format and whitespace checks pass.
- Original private OAS regression **26/26**. Independent three-tarball installation
  additionally compiles the public model signature and actual ICL literal-to-native
  binding replacement through core and SDK, with strict declarations, no symlinks
  and no skipped library checks. Report:
  `.local-artifacts/packed-consumer/2026-10-17T13-24-11-506Z.json`.
- Actual isolated n8n 2.37.10 **7/7**: the previous five cases plus a different
  producer's actual response value flowing into a subsequent request, and a
  replacement operation's renamed response field flowing into that request.
  Both new cases execute three APIs. The five-instance/Merge case uses two
  distinct operations; all cases together use three operations, not five distinct
  APIs. Report: `.local-artifacts/draft-edit/1792243790189-26426/report.json`.
  Sibling `execution-*.json` files preserve actual per-node execution data; report
  entries include received request paths rather than only declared test names.
- Chomsky token lookup again fails with DNS `ENOTFOUND` before model invocation.
  Live model calls and business service calls for this checkpoint are **0**.
  Local HTTP/model doubles and synthetic contract-server execution do not prove
  real-model semantic quality or the complete conversational host flow.

Native-setting/connection edit models, complete new-operation sub-stage composition,
specialized material-dependent registry refresh, requirement/question lifecycle,
official conversational LangGraph review/resume, mixed-field native runtime slots,
complete evidence/suggestion coverage and special-key policy remain unfinished.
Product changes remain uncommitted/unpublished and the complete goal stays open.

## Scoped API literal edit checkpoint

The [scoped input-edit contract](workflow-draft-api-input-edits.md) now connects
existing `revise-api-inputs` decisions to two independent LangChain functions:
`selectWorkflowDraftApiInputEditTargets` and `generateWorkflowDraftApiInputEdits`.
The first chooses only requested set/remove fields with current-message evidence.
Core derives target identities and original OAS field schemas. The second
extracts only actual selected typed values, never JSON encoded as `valueJson`,
unrelated inputs, IDs, schemas, revision or a replacement request. Hosts may
review between calls or provide structured targets/values to core without a model.

A removals-only contract requires no value call. Missing actual values return
`needs-input` with pending targets and no partially applicable resolution; they
do not silently reuse/delete old values. Supplied values must equal a complete
current-message JSON literal or a verbatim string. Unpatched nested data and
actual types are preserved. Targets cannot overlap each other or binding ownership;
dynamic properties remain available when OAS permits them. Code orders sets and
descending original-index removals and validates the resulting complete request.
Final assembly still owns whole-graph validation and approval invalidation.

The serializable contract is strictly shape-checked and re-derived from the
current plan/context. Modified target IDs/schemas, malformed persisted targets,
stale state and source changes during an awaited call are rejected without
rebase, value correction or hidden retry. Optional user-facing explanations and
actual current-message evidence are removed from both output schemas when disabled.
Source occurrence/type checks do not prove semantic target correctness.

Wire regressions exposed two construction/transport problems. Repeating an OAS
resource beneath multiple fields and chaining metadata on a ref-bearing schema
made duplicate resource identifiers. The output composition now owns one shared
original resource and fresh field projection metadata; it does not delete OAS
assertions. Separately, installed Zod attaches a non-enumerable `~standard` hook
to `toJSONSchema` output, so installed LangChain re-serialized that result as
Draft-7. The adapter now passes actual plain JSON data from official serialization,
preserving the intended dialect/inline settings; the original Zod schema still
parses the response. The clarification and semantic-edit serializers use the
same explicit JSON transport boundary. These were local wire failures, not a new
observed Chomsky HTTP 400. First evidence:
`.local-artifacts/2026-10-17-draft-api-input-edit-wire-first-failures.json`.

Latest verification on 2026-10-17:

- New literal-stage tests: **12/12**, including actual ChatOpenAI HTTP requests
  in both explanation modes. Combined draft-edit/clarification-wire/docs focus:
  **43/43**. No live model in scripted/local HTTP tests.
- Full regression: **556/557**, only the unchanged Ajv special `__proto__` case.
  Fresh workspace build/typecheck, lint, format and whitespace checks pass.
- Private original-OAS integration: **26/26**. The separate strict tarball
  consumer also tests original ICL OAS input deferral through the new core
  contract, both public model signatures and all three installed packages,
  without workspace symlinks or skipped library checks. Report:
  `.local-artifacts/packed-consumer/2026-10-17T12-50-02-755Z.json`.
- Actual isolated n8n 2.37.10: **5/5** paths. Its typed source-count edit now
  uses the new core contract/resolution before SDK compilation. The five API
  instances still use two distinct operations. No live-model editing or
  five-distinct-operation coverage is claimed. Report:
  `.local-artifacts/draft-edit/1792241402688-21243/report.json`.
- Chomsky token connectivity again fails with DNS `ENOTFOUND` before a model
  invocation. Actual model calls and business service calls for this checkpoint:
  **0**. Product changes remain uncommitted and unpublished.

The complete goal remains open. Reference/native/connection edit model stages,
new/replacement-operation staged composition, material-dependent registry refresh,
requirement/question lifecycle and official conversational LangGraph review/resume
are not completed by these literal stages. Mixed-field native runtime slots,
complete evidence coverage, special-key policy and live-model quality remain open.

## Draft edit assembly checkpoint

The [assembly boundary](./workflow-draft-edit-assembly.md) provides
`prepareWorkflowDraftEdit` and `assembleWorkflowDraftEdit`. It accepts the
validated semantic plan plus explicit per-stage results. Host-owned step IDs and
resolution kinds are not additional fields for a model to invent. API/native
identity, request provenance and revision ownership remain code-controlled.

Exact JSON-pointer edits preserve unpatched actual values, including nested
objects, arrays, `false`, `0`, allowed `null`, numeric/dotted property names and
expression-looking strings. Binding changes are explicit; setting a reference
does not silently delete a literal. Removing an actual required value derives
an original-contract input slot instead of inserting dummy data. New/updated
values still pass the original OAS or native parameter schema without coercion.

Declared consumers of a removed/replaced producer receive code-derived repair
tasks. An explicitly changed native output contract can create another downstream
task. Only affected API binding targets are editable through that repair task;
unrelated values and mappings remain untouched. Value-only and port-only changes
do not create unnecessary data-binding tasks. Port/edge validity remains a full
graph check, and edges must be changed explicitly by a connection-owning stage.
An empty repair acknowledges the existing mapping; it never bypasses validation.

Prepared materials are explicitly unvalidated. Final assembly re-derives them
from original inputs, then uses the existing atomic whole-draft contract/DAG
validation, impact calculation and scoped approval invalidation. An incomplete
repair, stale result or invalid final graph leaves the original unchanged. The
host decides whether to adopt/review the validated candidate. A no-change result
does not increment the revision. Scoped uncertainty becomes a pending requirement,
not an invented answer, while independent design can continue.

The first media-change regression exposed a production ownership error: an
explicit JSON-to-form edit still validated new fields against the old JSON
contract. Input editing now uses the explicitly selected OAS media contract;
deletion only removes existing, explicitly targeted old-format data. It does not
guess another format, coerce values or automatically clear incompatible fields.
First failure: `.local-artifacts/2026-10-17-draft-edit-media-contract-regression.json`.

Latest verification on 2026-10-17:

- Assembly regressions: **15/15**; combined edit-analysis/assembly/HTTP focus:
  **28/28**. HTTP tests inspect the actual local model request, not live Chomsky.
- Full regression: **544/545**, retaining the existing Ajv `properties.__proto__`
  failure. No skipped or weakened special-key assertion.
- Private OAS integration: **26/26**, including assembly using original operation
  keys/snapshots and preserved old instances; no business API calls.
- Independent three-tarball installation: strict TypeScript declarations without
  workspace symlinks or skipped library checks, original ICL compilation and
  explicit required-input deferral pass. Report:
  `.local-artifacts/packed-consumer/2026-10-17T12-15-51-954Z.json`.
- Actual isolated n8n 2.37.10: **5/5** cases. Original three-instance workflow and
  edited five-instance DAG execute; Merge receives four items. Missing input
  stops with zero HTTP requests, invalid source-response type stops before the
  dependent request, and explicit JSON-to-form selection sends the declared form
  body. Five API instances use two distinct operations, not five distinct APIs.
  Evidence: `.local-artifacts/draft-edit/1792239139757-15137/report.json` and the
  sibling `workflows.json`, `plan-and-change-set.json`, `observed-results.json`.
- Fresh build/typecheck, lint, formatting, documentation links and whitespace pass.
- Latest Chomsky connectivity probe fails before model invocation with DNS
  `ENOTFOUND`. These assembly regressions make **zero live-model calls**.

An initial integration attempt overlapped `npm test`'s clean build with readers
of generated `dist` files, causing missing runtime bundles. This was an agent
verification-scheduling error. After all clean builds finished, both private-OAS
and tarball checks passed on stable artifacts. No production runtime fallback
was added. The failed attempt is retained in
`.local-artifacts/2026-10-17-draft-edit-verification-race.json`.

Scoped model value/reference generation, full dependency-aware host scheduling,
material-dependent native-registry refresh, requirement/question lifecycle,
mixed-field native runtime slots, optional evidence across every stage and the
official conversational LangGraph edit/review/resume example remain open.
Live-model end-to-end quality and the special-key policy also remain unresolved.
This checkpoint establishes deterministic assembly, not natural-language editing
quality or complete OSS delivery. Product changes are uncommitted and unpublished.

## Draft edit analysis checkpoint

The [edit analysis boundary](./workflow-draft-edit-analysis.md) now provides
`analyzeWorkflowDraftEdit` plus core `createWorkflowDraftEditPlan`,
`describeWorkflowDraftEditContext` and `validateWorkflowDraftEditPlan`.
One bounded model call selects semantic edits and supplied candidates/targets;
code attaches original OAS keys, allocates new instance IDs and binds the plan
to the full draft, serialized context and current request messages. Explicit
structured proposals use the same core checks without a model invocation.

Value edits, producer-reference edits, native changes, connection changes,
requirement changes and scoped uncertainty have separate direct stage metadata.
This metadata is not a complete dependency-aware scheduler. Actual changed
values/settings/bindings/edges must still be planned separately, and their atomic
change set must pass the unchanged whole-graph/contract/impact checks. Removing
a producer does not silently delete its bindings or fix consumers. No canonical
draft, approval or revision is modified by semantic analysis.

Optional explanations are omitted from the wire schema when disabled. Exact
current-request provenance is always required; historical accepted messages do
not authorize a new change. Candidate identities, source existence, malformed
persisted metadata, stale state, modified derived IDs/stages and changes during
the awaited model call are checked without a hidden retry or rebase. Source
existence does not prove semantic entailment. Raw invalid proposals retain their
validation cause and stage for host-owned diagnostics.

Latest verification on 2026-10-17:

- Edit/clarification/draft focus: **39/39**, including a real ChatOpenAI local
  HTTP-wire test in both explanation modes. No live LLM in these tests.
- Full suite: **529/530**, with the existing special-key Ajv failure unchanged.
- Private real OAS: **26/26**; original snapshots and old instances survive
  separate prepared additions through atomic application.
- Independent consumer: three installed tarballs, strict declarations without
  symlinks and actual ICL OAS pass, including edit-plan exports and adapter signature.
  Report: `.local-artifacts/packed-consumer/2026-10-17T11-39-58-579Z.json`.
- Fresh build/typecheck, lint, formatting, documentation links and whitespace pass.
- Chomsky token connectivity still fails with `ENOTFOUND`, before any model call.

The first new private-OAS test omitted body media selection for a multi-format
operation. The fixture now calls the existing deterministic
`selectDefaultApiRequestMediaType` before creating both original and repeated
call materials; no production validation was weakened. First failure summary:
`.local-artifacts/2026-10-17-draft-edit-first-real-oas-failure.json`.

The later assembly checkpoint adds deterministic unpatched-value preservation and
declared consumer repair work. Scoped model-result generation, complete optional
evidence/suggestion coverage, official LangGraph edit/review/resume integration and
live-model/n8n quality evaluation remain. This analysis checkpoint did not execute a business API,
import a new workflow into n8n, publish a package, commit or push product code.

## Native runtime input checkpoint

The [native runtime input contract](./native-runtime-inputs.md) now provides
whole-object slots for JSON-output and StopAndError capabilities with
runtime-independent ports, references and output contracts. Original Zod/JSON
Schema validation, distinct node identities and API/native readiness are
preserved. Native values do not silently become confirmed draft values.

`planNativeNodes` has an explicit opt-in. Its output alternatives and capability
materials now share one factory. An earlier actual Chomsky response reported the
runtime branch unavailable. Inspection found that only the output schema
described it, while the capability materials did not; that first failure is
retained. The corrected contract passes an actual LangChain
HTTP-wire test, but live Chomsky verification is still pending: the latest run
failed at token-server DNS lookup (`ENOTFOUND`), before any model invocation.
There is no new model-quality success claim or hidden retry.

Execution preflight compiles every slot in a separate schema-resource scope.
Embedding repeated explicit `$id` roots under one map reproduced an Ajv resource
collision. Independent validators fix that composition error while preserving
original IDs, references, assertions and values. Regression tests include
recursive schemas, two instances of one capability, different original schemas
sharing an ID, and rejection of wrong nested values. The public combined Zod
contract is an in-process validator; serializers must preserve per-slot roots.

Latest development verification on 2026-10-17:

- Focused native/input/model-schema checks: **21/21**.
- Full suite: **516/517**; only the existing special-key Ajv regression fails.
- Private real OAS suite: **25/25**; no business API call.
- Fresh independent consumer: three installed tarballs, no workspace symlinks,
  strict TypeScript and runtime/native template exports pass. `ApiArgumentValues`
  is now a closed type alias with the same fields, allowing its JSON values to be
  nested in the JSON input contract without a cast or runtime type conversion.
- Typecheck, lint, Prettier, documentation links and whitespace checks pass.
- Isolated n8n 2.37.10: **7/7** cases pass. Missing/wrong input stops before all
  requests; valid/changed input each makes two unchanged contract requests and
  reaches Merge. A post-preflight wrong native type prevents echo (an independent
  health branch may already run); a stale revision permits zero requests.
  StopAndError preserves its actual runtime message, including expression-looking
  text. No business API or model is called by this runner.

The first two n8n runner reports are retained: the stale-revision evaluator first
assumed one independent guard would run first, then expected a revision word not
present in the actual API guard error. The evaluator now permits either valid
guard to stop the DAG, and the API guard names its expected revision. Neither
guard nor its validation condition was weakened.

Local evidence: `.local-artifacts/native-runtime-inputs/1792235535918-6510/`,
`.local-artifacts/packed-consumer/2026-10-17T11-08-30-601Z.json` and
`.local-artifacts/native-runtime-live/1792235310540-5206/`. Local reports are not
published fixtures. Mixed field slots, arbitrary structural native settings,
model edit proposals, official conversational LangGraph integration and full
end-to-end quality evaluation remain. No product commit, push or publish was
performed for this checkpoint.

## Deferred API input contracts

`collectDeferredApiInputSlots({ materials })` accepts OAS-resolved operations,
stable `callId`s, explicit literal values, bindings and a selected body media type
when required. It returns only OAS-required missing literal locations. Optional
fields remain absent, bound fields remain owned by their declared source, and
OAS examples/defaults do not become confirmed values.

Slot IDs include the call identity, operation/snapshot, request pointer and
schema through the existing clarification identity. Two calls of the same
operation remain separate. Slot metadata contains no fabricated `value` field.

```js
import {
  collectDeferredApiInputSlots,
  createDeferredApiInputsSchema,
  inspectDeferredApiInputs,
  materializeDeferredApiInputs,
} from '@openapi-flow/core';

// materials comes from resolved OAS operations and the current explicit plan.
const slots = collectDeferredApiInputSlots({ materials });
const formContract = createDeferredApiInputsSchema(slots);
const pending = inspectDeferredApiInputs({ materials, inputValues: {} });

// This boundary requires actual host/user-supplied JSON values keyed by slot ID.
// It throws DeferredApiInputError for missing, invalid or stale slot values.
const args = materializeDeferredApiInputs({ materials, inputValues });
```

`inspectDeferredApiInputs` returns `needs-input` without executable arguments
when required values are missing, `invalid-input` for invalid/unknown values,
or `ready` with materialized arguments. Invalid full-request combinations still
fail the original request validator; a per-field union is not a replacement for
the complete OAS contract. Runtime response bindings are preserved for their
existing downstream materialization and validation stage.

The execution boundary re-derives slots from authoritative materials, not from
client-edited slot schemas. `false`, `0`, allowed `null`, empty strings and valid
empty containers are values, never missing-input sentinels. The form schema is a
presentation/input contract, not authority to alter the original OAS.

## Draft edits and readiness

`createWorkflowDraft({ content, context })` owns initial revision and approval
state. Content is JSON-serializable and stores operation keys, not executable
capability functions. Context supplies the actual operation contracts, native
implementations and source messages. Requirements explicitly name a workflow
or node scope; an omitted scope is not guessed.

The canonical draft must retain valid node identities, literal/binding contracts,
ports, dependency routes and acyclic structure. A host may hold an incomplete
unvalidated proposal separately while planning its connections. Such a proposal
does not overwrite the last valid canonical draft.

`inspectDraftReadiness({ draft, context })` separately reports planning readiness,
request input readiness and human review coverage. A deferred decision blocks
its explicit scope and dependents; an absent concrete request value leaves
planning possible and becomes a slot. These facts do not establish deployment
credentials or complete workflow execution readiness.

`applyDraftChangeSet({ draft, context, changeSet })` requires `baseRevision` and
explicit actions. It edits an isolated candidate, validates the complete result,
computes structural impact, invalidates only affected approval coverage and
returns one new revision. It does not delete wires/bindings to repair a removal.
No-op proposals, stale revisions, invalid values and invalid graphs fail.

`approveWorkflowDraft` is an explicit host action with an expected revision,
not a model output field. Review history retains its original node scope and
records invalidated coverage without discarding approvals of unaffected nodes.
Pure structural impact analysis does not prove that a natural-language change
was interpreted correctly; semantic ambiguity still needs human clarification.

## Verification sequence

1. Verify core contracts without an LLM, using boundary fixtures and actual private OAS.
2. Implement and execute SDK templates against an isolated contract server.
3. Add described model schemas and prove call ownership/minimality without hidden retries.
4. Extend the official host example through review, resume and completed-plan edits.
5. Evaluate short queries, ambiguous choices, edits, deferred values, native nodes
   and multi-API DAGs with real model and isolated n8n evidence.
6. Validate independent installed-package types/exports and release documentation.

Do not publish, deploy, or claim unseen-service reliability from these development
regressions. Numeric quality acceptance remains an owner decision after results.

## SDK input templates: current development evidence

`compileN8nWorkflowTemplate({ draft, context, name, deployments?, inputValues? })`
returns the SDK workflow, revision, canonical `draftReadiness`, separately evaluated
actual `requestInputsReady`, deployment-reference readiness, compiled node/slot
mappings and a Korean guide. A missing optional value map means no actual inputs,
not generated defaults. Supported runtime-independent native parameter objects
can now be explicit slots; structural native decisions must still be concrete.

The normal path is Manual Trigger → input configuration → global preflight →
the original API/native DAG. Preflight checks every initial slot and completely
checks initial requests without response dependencies. Every API materializer
also checks its complete unchanged request after applying actual inputs and
declared producer bindings. The strict `createHttpRequestNode` boundary still
rejects missing values; template compilation does not erase unresolved pointers
and pretend that they are resolved.

Unanswered design decisions or missing deployment references detach Start while
retaining the internal DAG and Korean instructions. Missing actual request values
alone do not detach Start: preflight rejects them before external calls. Supplied
credential references do not establish actual n8n access. Direct JSON editing,
partial execution and pinning can bypass the normal path; this is not a security
boundary or direct n8n deployment feature.

`integration/workflow-template-local-n8n.mjs` imported SDK JSON into isolated
n8n 2.37.10. Missing inputs and a wrong numeric type each failed at preflight
with zero requests. Valid inputs made three contract-server requests and reached
Merge, preserving zero, false, null, arrays, objects, numeric object keys and a
literal expression-looking string. A wrong source response stopped the dependent
request before its HTTP node. No business service or model was called.

The first valid execution exposed `Object.defineProperty` being ineffective in
the restricted Code runtime. Input assignment now shares a pure OAS-container
implementation using fresh JSON dictionaries; prototype-mutation shims are not
installed. Original `not`/`if` predicates are also retained when projecting
incomplete request fields, avoiding a changed predicate after removing required
assertions. Full request checks remain unchanged.

The template-only checkpoint passed 34/35 checks. The failing regression intentionally
declares an ordinary JSON data key named `__proto__`: Ajv 8.20.0 explicitly
filters that name from `properties`, causing the unchanged closed-object schema
to reject it as additional data. This was a synthetic boundary case, not an ICL
business scenario. No equivalent-schema rewrite or field removal has been
approved or applied. Subsequent regression/install/private-OAS verification is
recorded below; the special-key failure has not been skipped or relabeled.

## Requirements clarification: current development evidence

`clarifyWorkflowRequirements({ model, context, limits, options? })` performs one
bounded model call. Core validates its proposal and supplied sources, allocates
question/choice IDs and retains the original user messages even when the model
returns questions without extracted statements. The output contains no model-owned
revision, approval, readiness, runtime argument values or workflow JSON.

`resolveWorkflowClarificationReplies({ round, context, replies, previous? })`
checks exact question/choice identities and answer kinds. It preserves confirmed
answers, distinguishes pending questions from explicit deferral, rejects stale or
modified state and never adopts optional suggestions automatically. Structured
facts and original messages remain authoritative; the readable prompt is derived
by code. This is a round-level contract, not completed-plan conversational editing.

Explanations/suggestions are independently optional; disabled fields are absent
from the model schema. Required host question budgets have no missing-env defaults.
OAS evidence selects only a supplied candidate ID: code attaches its original
operation key/snapshot and the complete Operation Object as the cited source.
Core still supports explicitly supplied fine-grained source pointers. Exact-source
checks establish existence, not semantic entailment of a model's explanation.

An optional `entrypoint` describes a host/compiler-owned start separately from
selectable native instances. `describeN8nManualTrigger()` and the SDK trigger
creation share one module. Omitting this contract does not silently assume a
start capability. The generic core does not import a hidden n8n registry.

The first real Chomsky call returned HTTP 400 because LangChain's Zod response
formatter combined generated references with sibling description/title metadata.
Official Zod inline Draft-7 serialization now owns this function's wire format;
the original Zod schema still parses the response. An intermediate HTTP-test
failure used a Draft-2020 validator for the wire's explicit Draft-7 dialect; the
test now validates the actual declared dialect. No assertions/descriptions were
deleted and no rejection-triggered retry was added.

A later native-only attempt asked for an already compiler-owned Manual Trigger,
exposing the missing entrypoint contract. Another attempt generated a wrong OAS
source pointer and was rejected unchanged. The final proposal schema no longer
asks the model to construct a pointer for an operation-wide citation. These
failed runs remain separate artifacts, not repaired successful attempts.

At the requirements-clarification checkpoint: focused checks 15/15, full
regression 495/496 (only the unchanged special-key failure), typecheck, lint and
format checks passed. The independently installed tarball consumer checks strict
declarations and actual OAS compilation, including draft/template/clarification
exports, without workspace symlinks. Private-OAS checks passed 24/24 separately.
The isolated n8n template runner again passed four cases: missing/wrong initial
inputs make zero requests; valid inputs execute three APIs and Merge; an invalid
source response prevents the dependent request.

The latest actual Chomsky smoke returned all three proposals: the short ICL
request asked two scope questions, the explicit API request asked none, and the
native-only request with the supplied entrypoint asked none. This checks only
requirements clarification, not downstream API selection/values/DAG execution,
statistical reliability or release acceptance. Business services were not called.
The full goal remains active: native slots, registry host integration, edit
proposals, official host edit/resume composition and full end-to-end quality
evaluation remain unfinished.

See [the usage contract](workflow-requirements-clarification.md) for ownership,
examples and limitations. All these source additions remain unreleased.

## Native registry: current development implementation

`resolveN8nNativeFeatures({ features?, apiMaterials?, nativeOutputSources?,
jsonOutput?, itemMode?, extensions? })` exposes one exhaustive registration map
for the eleven existing capability families. The immutable `N8nNativeFeature`
value is also the TypeScript selection union. Missing map entries are compile
errors; instantiated fixed-name factories must retain their registered identity.
The host-owned typed JSON producer intentionally retains its explicit custom name.

An omitted list inventories every family with `ready` or `requires-context`
status. The capability array contains the ready entries and explicit extensions;
pending entries retain named material prerequisites rather than fabricated schemas.
An explicit selection fails when a requested family lacks its actual source
contract. Unknown/duplicate features, invalid supplied context and duplicate
capability names fail before planning. `[]` selects none. Nothing generates values,
model output, source contracts, node instances or batch scopes in this boundary.

The old four-feature factory delegates with its original explicit selection, so
existing consumers do not silently acquire a different capability set. Registered
factories retain existing Zod schemas, provenance, ports and SDK lowering. This
is not support for every n8n built-in node, and `ready` is not a proof of valid
graph connections, response pointers, runtime ancestry or credentials. The host
must re-resolve material-dependent features after actual contracts exist; the
official conversational example has not yet been converted to this staged registry.

See [the registry contract](native-feature-registry.md). Focused tests cover all
eleven factory compilations and a scripted-model native-only SDK workflow. They
do not establish real-model selection quality or execution of every family in
this new registry composition. The first focused run failed because its test
double tried to convert already-serialized JSON Schema as Zod; the test now
inspects the actual JSON argument unchanged. Product model behavior was not
changed to accommodate that test.

Final registry checkpoint: eight registry tests and the expanded documentation
link check passed; full regression passed 503/504 with only the unchanged
`properties.__proto__` failure. Fresh build, workspace typecheck, lint, format
and whitespace checks passed. Private OAS integration passed 25/25. The separate
strict tarball consumer verified the public enum, named types and a feature
requiring an actual ICL contract without workspace symlinks or skipped library
declaration checks:
`.local-artifacts/packed-consumer/2026-10-17T07-06-39-295Z.json`.

The isolated n8n runner now explicitly selects `N8nNativeFeature.MergeAppend`
through the new resolver. Its four template cases passed: missing/wrong initial
inputs stopped before any request, valid inputs executed three APIs and Merge,
and an invalid source response stopped the dependent request after the first
call. Evidence:
`.local-artifacts/workflow-template/1792220797575-95240/report.json`.
This is not execution coverage of all eleven families through the registry, nor
a new real-model quality evaluation. No business service was called. Product
changes remain uncommitted and unpublished; the complete goal is still open.

## Unreleased: input edits after a same-plan operation replacement

Private host validation against published 0.3.2 exposed a mismatch between edit
assembly and input planning. Atomic assembly already orders an operation
replacement before its detail edits, but `describeWorkflowDraftApiInputEdit`
unconditionally rejected any input edit whose plan also replaced that API. Its
input contract did not accept completed material resolutions. This was not an
OpenAPI or n8n limitation, and banning that semantic plan is not the fix.

The source input contract now accepts explicit completed `resolutions` and
`repairs`. The descriptor derives the actual call and OAS operation from
`stageWorkflowDraftEdit`; unresolved contracts/requirements and already supplied
results fail explicitly. Input-edit identity also binds the staged fingerprint,
so changing completed values invalidates the old target contract even when its
schema is unchanged. Resolution uses the same staged operation. Original draft,
instance identity, typed values, binding ownership and final atomic adoption are
preserved. Omitting resolutions means none have been completed, not permission
to substitute the previous operation.

The reference scheduler waits for a blocked replacement contract before input
target or binding-edit work. Synthetic regressions first failed with the same
published error, then passed after the source fix: same-plan replacement plus
typed string input, exclusion of an old-operation-only field from the target
inventory, stale staged values, unresolved materials, original-draft preservation
and no early detail-model call. Focused core/LangChain transport and source tests
passed 26/26; the new reference-conversation regression and both graph-document
tests also passed. Final workspace build, typecheck, lint, format, whitespace and
graph checks passed. Full `npm test` passed 1151/1152, with only the unchanged
Ajv `properties.__proto__` runtime-validator failure. An intermediate generated
graph-document mismatch was repaired by regenerating from the registered graph;
the final full run includes that passing regression. Private original-OAS
integration passed 51/51 without model or business API calls.

These source changes are not published or installed into the private host.
The running host still consumes public 0.3.2; no local tarball, alias, registry
override or source import was used to claim live success. A real-model rerun
through a newly published public package remains required. No business API was
executed, no source commit/push/publication was performed, and no private OAS or
application source was copied into this public repository. The next section records
the later source implementation of direct typed replies; host/UI integration and
publication remain separate work.

## Unreleased: explicit typed replies for pending API literal edits

Core now exposes `WorkflowDraftApiInputEditAnswers` and
`createWorkflowDraftApiInputEditAnswersSchema`. A human packet identifies the exact
current contract and supplies values only for set-targets the original validated
model proposal left `needs-input`. `resolveWorkflowDraftApiInputEdits` accepts it
as optional `confirmedAnswers`, separate from unchanged model `output`. It returns
the original proposal and a separate cloned human receipt. No synthetic messages,
model explanations, source-text spans, coercion, invented values or extra model
call are introduced. The shared original OAS value validator is extracted from
the previous model-value schema rather than reimplemented.

Unknown/duplicate targets, stale contracts, targets already provided by the model,
removals, invented metadata and wrong types fail explicitly. Partial answers leave
the canonical draft untouched and return the still-pending fields; callers own
explicit cumulative reply storage and review-token/revision authorization. All
selected values must exist before cross-field OAS validation returns a complete
resolution for normal atomic assembly and review. Typed replies cannot legitimize
invalid original model evidence. Public packet types compose the original core
JSON-value type and are not copied into a private host.

Seven new focused regressions cover JSON types, leading-zero strings, isolated
receipt/value copies, partial answers, stale/duplicate/coerced fields, unchanged
source checks, no-pending/removals-only wire schema, original resource references,
tuples, OAS 3.0 nullable values and whole-request conditional constraints. The first
tuple fixture used a reference relative to the wrong document root and was rejected
by the parser before this feature ran; it now points to the actual OAS document
location without changing production parsing. A private original-ICL regression
checks a pending string query input, an explicit typed reply, atomic assembly and
SDK template compilation without model or business API calls.

Final `npm test` passed 1158/1159, with only the unchanged approved Ajv
`properties.__proto__` runtime-slot failure and no skips or cancellations.
Workspace build, typecheck, lint, format, whitespace and graph-document checks
passed. Original private-OAS integration passed 52/52. The isolated three-tarball
consumer passed strict TypeScript with `skipLibCheck: false` and no workspace
symlinks, including the public typed packet/schema/result and runtime resolution
against the original 34-operation ICL snapshot:
`.local-artifacts/packed-consumer/2026-10-20T21-29-34-333Z.json`.
Its first new fixture attempted to assemble the same already accepted value and
correctly failed the existing no-change guard. The fixture now answers the actual
previously deferred input; production no-change checks were not relaxed.

These changes are still source-only and uncommitted/unpublished. At this Core-only
checkpoint, neither the consuming host's existing-API literal-edit form nor the
reference conversation question handler used the new packet. The consuming host
remains on public 0.3.2; the later reference-host work is recorded below. The tarball consumer
is a source packaging check, not a public-registry installation or an upgrade of
that host. Real-model editing quality, a newly published strict package consumer
and a live post-install UI run remain unverified. The known approved Ajv limitation
is not changed or bypassed.

## Unreleased: reference conversation resumes typed existing-API input edits

The source reference LangGraph now returns `api-input-edit` questions with Core's
actual target/schema/contract identity and accepts `answer-api-input-edits`.
The response envelope composes Core's public structural packet schema; its packet
types are inferred from that same schema. Core's contextual resolver, not the
transport envelope, owns OAS/current-target and complete-request validation.
The host explicitly accumulates partial typed replies against the unchanged
original proposal and original planning bundle, then schedules normal assembly
and review. No new graph node, model call, synthetic natural-language evidence,
value coercion, implicit deferral or execution request is introduced.

Private `apiInputEditAnswerHistory` records actual submission/step IDs and typed
packets separately from model messages. Tokens bind these receipts. Bad values,
foreign/duplicate/already-answered targets, stale tokens and reused submission IDs
return explicit issues without adopting an edit or replaying model work. Question
and final-review actions stay distinct. Review mode still waits for final approval;
automatic mode follows its existing policy. Independently pending planning work
and explicitly enabled follow-up suggestions can still invoke their own models.

Four new actual MemorySaver/Command regressions exercise partial checkpoint
restoration and completion, rejection/cancellation invariants, final-review
adoption and a same-plan operation replacement followed by a typed detail edit.
The first run's only new failure was an incorrect expected original fixture ID;
the test now compares the original draft snapshot instead of a guessed literal.
Production behavior was not relaxed. The private original-ICL test additionally
drives this graph through three scripted planning calls and a typed string reply
to SDK template output, preserving original data and making no business call.

Final `npm test` passed 1162/1163 with no skips/cancellations; only the unchanged
approved Ajv special-key case failed. Fresh build, workspace typecheck, lint,
format, whitespace and the regenerated 30-node/68-route graph checks passed.
Original private-OAS integration passed 52/52, including the new checkpointed ICL
reply path. The updated strict three-tarball consumer passed with no workspace
symlinks or skipped library declaration checks, including the new public transport
schema and inferred packet types:
`.local-artifacts/packed-consumer/2026-10-20T21-45-23-286Z.json`.
These scripted model responses prove contract flow, not real-model language quality.

At this checkpoint it was unreleased reference-host source, not a Qoopilot form
integration or fresh real-model/n8n execution. The later source-live check is
recorded below. The consuming private host remains on public 0.3.2. Publication and
post-install live validation still require the pending source-first release
authorization. The approved Ajv `properties.__proto__` limitation is unchanged.

## Live source validation: typed edits and display language

The real Chomsky model used the complete original 34-operation ICL catalog through
the reference LangGraph. One initial explicit-input request and two literal-value
edits were followed by the short request `상품번호를 바꾸고 싶어. 새 번호는 직접 입력할 테니 먼저 물어봐.`
The model produced a real `api-input-edit` question at the declared string input;
the evaluation driver did not inject a missing-field question or repair output.
An explicit synthetic typed reply preserved `"0007"`, the unchanged model proposal
and transcript, and reached final review without another model invocation. The
driver's explicit approval, not the model, adopted the candidate.

The first functional cohort passed 11 actual planning calls, four isolated n8n
executions and four OAS-valid local contract-server requests, with zero business
API calls and zero retries. Its original reports and complete checkpoints remain
in `.local-artifacts/canonical-input-reply/1792533168292-81703/`; model trace:
`.local-artifacts/typed-input-edit-live/1792533163540-81703/`.
Three of twelve short user-facing reasons were English. The semantic-edit, target
and value prompts and their reason-schema descriptions omitted a general current-
user-language instruction. Only capability-gap reasons had such a prompt rule.

The source now states that optional display reasons use the current user's language
and that identifiers, literal values and source quotations stay unchanged. It
does not add a translation call, language-based Zod rejection, output repair or
production retry. Two actual-ChatOpenAI local HTTP regressions first failed on
the missing wire instruction and passed after the prompt/description change;
they prove transmitted instructions and preserved contracts, not model language
reliability. A new configuration guard also rejects a typed live fixture without
its explicit edit scope and real model-call observer before external work starts.

A separately labeled fresh cohort after that source change again passed 11 model
calls and four isolated n8n executions/requests. All twelve observed display
reasons contained Korean, and the final HTTP query retained the leading-zero
string. The original pending model value stayed `needs-input`; human values
remained a separate receipt. The same first cohort was not overwritten or relabeled.
Post-change artifacts: `.local-artifacts/canonical-input-reply/1792533528432-82625/`;
model trace: `.local-artifacts/typed-input-edit-live/1792533523884-82625/`.
Both owned temporary n8n volumes were removed and their absence checked.

These are eight executions of four versions of one known-service conversation,
not eight independent holdout scenarios or a general quality score. Contract
responses and bearer credentials were synthetic, approvals were test-driver
actions, and execution was isolated. Exported JSON still targets that temporary
local responder and local credential, not a deployed ICL service. No Qoopilot
memory server or browser conversation was restarted or upgraded.

Final `npm test` passed 1163/1164 with no skips/cancellations and only the unchanged
approved Ajv `properties.__proto__` runtime-slot failure. Fresh build, workspace
typecheck, lint, format, whitespace and regenerated graph checks passed. Original
private-OAS integration passed 52/52. The strict three-tarball consumer passed
without workspace symlinks or skipped library declaration checks:
`.local-artifacts/packed-consumer/2026-10-20T22-04-34-227Z.json`.

At that checkpoint source commit/push and publication were still pending authorization; the private product declared public
0.3.2 and has not consumed these changes. Public-package installation, Qoopilot
form/live-browser integration and broader quality/stream-load evaluation remain
open. The approved Ajv special-key limitation is unchanged.

## 0.3.3 source-first release preparation

The owner authorized committing and pushing reviewed release source to public
`main` before publishing all three 0.3.3 packages, followed by private-host public
installation with exact-version-only release-age exceptions. The three manifests,
adapter core dependencies and source example dependencies are aligned. No broad
policy exception, source import or local tarball substitution is authorized or
used for product integration. See the [release record](releases/0.3.3.md) for
verified source, package and host states; publication is not source synchronization.

The reviewed 0.3.3 source was pushed before publication. All three public versions,
latest tags and downloaded SHA-512 values now match the tested post-commit archives.
The private host installed the public versions with exact-version-only exceptions;
its 250 tests, strict checks, production build and frozen install passed. No source
or local tarball was substituted into that host. See the release receipt for exact
source identity and publication times. Direct existing-value edit forms, fresh
post-install real-model/browser validation and broader quality/stream-load work
remain separate; the complete product goal is not declared finished.

## 2026-10-24 local argument-error context preservation

`generateWorkflowDraftApiCallArguments` returned the optional enum-selection
Promise directly from a `try` block. A rejection during that helper's initial
literal-provenance validation therefore escaped the enclosing `catch`. The
original rejection still reached the caller, but the promised typed argument
failure did not retain its model output and stage. This also occurs when the
operation has no enum candidates: the helper validates the initial proposal
before deciding whether a separate enum model call is needed.

The local source separates synchronous provenance/candidate validation from the
asynchronous model selection. An initial validation error now reaches the existing
arguments error boundary, which retains that output and the original cause.
Enum-output validation keeps its own error boundary and stage; a model transport
rejection still propagates as the original error without a retry. Merely awaiting
the entire helper in the outer catch would incorrectly relabel enum transport
failures as arguments failures; the added transport regression rejects that
approach. No values, source quotes, types or OAS contracts are changed to make a
rejected plan pass.

Four regressions cover malformed literal provenance and correct unchanged values
with enum selection both enabled and disabled. The enabled malformed-provenance
case failed before the source fix while the other three passed. A separate Core
example verifies that source text `100` describes a string when its declared
source format is `text`, whereas the same original token is numeric JSON when
declared as `json`; code does not convert between these values. This is a
deterministic example, not a claim about an uncaptured model output.

Final verification for this local change passed all 31 focused tests, including
the enum transport identity regression. The complete suite passed 1,269 of 1,270
tests, with only the existing Ajv special-key failure and no skipped or cancelled
tests. Build, typecheck, lint, format and source-derived graph checks passed.
The conversation graph remains at 30 nodes and 68 edges. These stored results
were rechecked on 2026-10-25; no new model or workflow execution was required.

The change remains uncommitted and unpublished in the local 0.3.14 candidate.
The public host still uses 0.3.13. The existing Zod 3 security release blocker and
approved Ajv special-key limitation remain unresolved; neither is bypassed by
this diagnostic fix.

## 2026-10-25 source-owned structured error contract (unreleased)

Added a common `OpenApiFlowError`, public guard, code/diagnostic Zod schemas and
inferred types in core. Adapters import this contract rather than duplicating
its shape. Source boundaries own the package, operation, stage and code. Exact
binding coverage counts are required for the coverage-mismatch diagnostic.
Unknown failures identify the observed boundary without guessing a network,
timeout or schema cause from message text. Existing typed errors pass through
outer boundaries unchanged; newly wrapped exceptions retain their exact cause.

The original message, stack, cause and legacy planning failure/output remain
private. `toJSON()` is an explicit closed projection; callers must not log/spread
the entire error. Existing native and graph error subclasses retain their
identities, messages, `failure` payloads and causes while supporting the common
diagnostic projection. No model retry, value repair, skipped validation, new
OAS acceptance limit, host logging dependency or execution policy was added.

Covered paths are OAS validation/reference resolution, API operation selection,
binding planning and public assignment/gap checks, existing native/graph planning
error classes, planned n8n compilation and template compilation. This is not a
migration of every internal throw or every provider-specific timeout identity.
The model helper distinguishes configuration, invoke and recognized LangChain
output-parser failures. Only a numeric own `status` data property is exposed;
status getters, alternate fields and error-name/message guesses are not used.
The evaluation example now consumes the public diagnostic for interruption and
HTTP status instead of depending on raw transport fields on an outer Error.

Verification: all 45 focused error/evaluation/checkpoint tests passed, including
18 dedicated error-contract tests. Real ChatOpenAI
transport against loopback HTTP fixtures distinguished HTTP 400, truncated tool
arguments, complete-call coverage rejection and a valid result, with exactly four
requests and no hidden retries. A private multi-document OAS regression prepared
170 real operation contracts, rejected a 169-call proposal with exact numeric
counts, then accepted a complete independent-binding proposal without changing
the documents. These are deterministic/model-double regressions, not a replay or
diagnosis of an uncaptured production model exception. Existing private real-OAS
regressions passed 55/55. An independent packed consumer installed all three
tarballs without workspace symlinks, compiled strict types and exercised the new
public error imports and existing compilation paths. The dedicated public
`@openapi-flow/core/errors` entry point also bundled and executed in a browser
environment without Node APIs or polyfills, with the same class identity as
the default server entry point. The final complete suite passed 1,287/1,288;
the sole failure is the unchanged approved Ajv special-key runtime-slot case.
No tests were skipped or cancelled. Final build, workspace typecheck, lint and
format checks passed. The SDK export-failure checkpoint regression now asserts
the typed outer error and exact original cause identity, without relaxing the
canonical draft, pending checkpoint, absent artifact or model-call assertions.

The source-derived conversation topology is unchanged. The work remains local,
uncommitted and unpublished in the existing 0.3.14 candidate. Qoopilot stays on
public 0.3.13; its server logging/UI integration still needs a source-first release
and host update. No local tarball was substituted into that host, and no Chomsky,
business API, n8n engine or service deployment was invoked for this change.
The existing security publication blocker and approved Ajv special-key limitation
remain open; this diagnostic implementation does not resolve them.
