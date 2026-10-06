# @openapi-flow/langchain

Independent model calls for OpenAPI workflows. Unreleased `0.2.0` source; this package is not yet published.

- `selectApiOperations`: choose catalog candidates and describe capability gaps with structured output.
- `planApiBindings`: selected OAS contracts → API response-to-request pointer bindings and request-data gaps, independently of native control-flow planning.
- `generateApiArguments`: propose one call's OAS-typed request values and report missing inputs.
- Requests with no remaining literal inputs return empty values without invoking the model, including fully bound nested closed bodies and whole-body bindings. OAS-permitted additional properties remain potential literal inputs.
- `planWorkflowGraph`: selected API contracts/values and registered native capabilities → typed native settings, conditions/assertions, explicit DAG edges/starts and gaps.
- `planReviewableWorkflowGraph`: ready/blocked API materials + identified gaps + native capabilities → a validated internal DAG retaining unresolved steps. Structured output contains `nativeNodes`, `edges`, `additionalGaps` and `blockedCalls`; core derives roots and validates all references. Gap IDs have ports but no fabricated API output. Calls dependent on unavailable scenario work must be explicitly blocked; nonexistent API values/code are never invented. Graph array order does not define execution order.

Argument generation uses core's `createApiArgumentGenerationContract` for both the structured-output schema and `literalInputSchema` in the HumanMessage. It does not send the original parameter/body definitions or the binding plan to that model stage. Forbidden bound paths may appear as negative schema constraints, never as available inputs. Invalid proposals fail schema parsing rather than being repaired or silently trimmed. This literal-ownership contract is separate from the unchanged OAS contract used after runtime values are assembled.

The host supplies a LangChain chat model. No model endpoint, Chomsky adapter, agent loop, LangGraph checkpoint storage or n8n connection is created internally. These functions use named message classes and Zod output schemas with field descriptions. The host can place each invocation in its own LangGraph node and control retries/HITL. Plan bindings before literal arguments so response-supplied fields are not invented as constants. Final graph planning uses these dependencies together with scenario-required order and conditions.

This package depends on core and has a LangChain peer dependency; it does not depend on n8n. The graph schema is built from host-provided capability schemas. The planner validates executable proposals without repairing them; gap proposals remain non-executable and are returned for host review. It does not generate JavaScript, credential data, deployment origins or API-node JSON. Old single/linear planning functions live under `/legacy`; full generation compositions are private workspace examples, not this package's main API.

Binding gap output now requires `{ callId, targetPointer, description }`, not a description alone. Each target must exist in the request OAS. Assignment validation still runs on gap reports, so invalid bindings cannot be disguised as unmet requirements. The host decides whether to fail immediately or prepare a review workflow.

See the [workspace guide](https://github.com/carefreelife98/openapi-flow#independent-stages). Our code is MIT-licensed; dependency terms remain separate.
