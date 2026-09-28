# @openapi-flow/core

An importable Node.js library for turning a natural-language scenario and an OpenAPI document into a reviewable n8n workflow. It does not provide a server, connect to an n8n instance, or execute workflows.

```sh
npm install @openapi-flow/core @langchain/core @langchain/openai
```

The host supplies an OpenAPI JSON object, a LangChain chat model, and a trusted API origin. See the [usage and current limitations](https://github.com/carefreelife98/openapi-flow#current-api) before generating workflows. `generateWorkflow` sends operation metadata to the host-supplied model. Review the resulting plan and workflow before importing it into n8n.

The package uses Zod to validate structured model output while keeping the supplied OpenAPI document as the request and response contract. LangChain converts the Zod output schemas to JSON Schema for compatible chat models.

This package's own code is MIT-licensed. Its `@n8n/workflow-sdk` dependency is separately licensed under [n8n's Sustainable Use License](https://docs.n8n.io/n8n-community-license/), which places conditions on use and redistribution. The MIT license for this package does not change those conditions. See [third-party notices](./THIRD_PARTY_NOTICES.md).
