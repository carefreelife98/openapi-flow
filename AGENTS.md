# Repository conventions

- `packages/core` is the importable library. Keep the repository root as the private npm workspace; do not add a server unless requested.
- Put TypeScript type aliases and interfaces in `packages/core/src/types/`. Do not declare anonymous object types or local type/interface definitions in logic files.
- Keep shared OAS types in `types/openapi.ts`; request contracts in `types/request.ts` and `types/request-workflow.ts`; inbound contracts in `types/inbound.ts` and `types/inbound-workflow.ts`.
- Put structured-output schema definitions in `packages/core/src/schemas/`.
- Keep OpenAPI parsing, AI planning, and n8n compilation in their named domain directories. Place reusable validation and other shared helpers in `src/utils/`; keep domain-specific helpers in clearly named sibling files.
- Distinguish OAS operation sources from n8n node types: `openapi/common` and `workflow/common` hold shared contracts; `openapi/request|webhook|callback` and `workflow/request|webhook|callback` own source-specific behavior. Keep inbound assembly shared in `workflow/inbound` without duplicating Webhook nodes for callback operations.
- Use descriptive file names. `src/public-api.ts` is the package export boundary; do not introduce an ambiguous `index.ts` or `index.tsx` entrypoint.
- Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` from the repository root after changes.
