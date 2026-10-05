# @openapi-flow/langchain

Independent model calls for OpenAPI workflows. Unreleased `0.2.0` source; this package is not yet published.

- `selectApiOperations`: choose catalog candidates and describe capability gaps with structured output.
- `generateApiArguments`: propose one call's OAS-typed request values and report missing inputs.
- `planWorkflowGraph`: selected API contracts/values and registered native capabilities → typed native settings, conditions/assertions, explicit DAG edges/starts and gaps.

The host supplies a LangChain chat model. No model endpoint, Chomsky adapter, agent loop, LangGraph checkpoint storage or n8n connection is created internally. All three functions use named message classes and Zod output schemas with field descriptions. The host can place each invocation in its own LangGraph node and control retries/HITL.

This package depends on core and has a LangChain peer dependency; it does not depend on n8n. The graph schema is built from host-provided capability schemas. The planner validates executable proposals without repairing them; gap proposals remain non-executable and are returned for host review. It does not generate JavaScript, credential data, deployment origins or API-node JSON. Old single/linear planning functions live under `/legacy`; full generation compositions are private workspace examples, not this package's main API.

See the [workspace guide](https://github.com/carefreelife98/openapi-flow#independent-stages). Our code is MIT-licensed; dependency terms remain separate.
