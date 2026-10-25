# Repository conventions

- `packages/core`, `packages/langchain`, and `packages/n8n` are importable libraries. Core must not import LangChain or n8n; the two adapters depend only on core. Host-owned compositions live in `examples/`. Do not add a server unless requested.
- Put TypeScript type aliases and interfaces in their owning package's `src/types/`. Do not declare anonymous object types or local type/interface definitions in logic files.
- Keep OAS/catalog/argument contracts in core, model invocation contracts in langchain, and SDK node/workflow contracts in n8n. Legacy types are explicitly named or nested under `types/legacy/`.
- Put structured-output schema definitions in the owning package's `src/schemas/` and model instructions in langchain's `src/prompts/`.
- Keep OpenAPI parsing, AI planning, and n8n compilation in their named domain directories. Place only domain-neutral helpers in `src/utils/`; put domain-specific validation and mapping in their owning directory.
- Core's `openapi/common`, `openapi/catalog`, `openapi/request` and `openapi/inbound` own OAS intake and source contracts. N8n's `nodes/request` and `workflow` own node creation and graph assembly. Prior workflow implementations live under n8n's `legacy/workflow/`; prior planning under langchain's `legacy/planning/`. Add source-specific behavior only when it differs. Never infer execution order from the selection array.
- Use descriptive file names. `src/public-api.ts` is the package export boundary; do not introduce an ambiguous `index.ts` or `index.tsx` entrypoint.
- Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` from the repository root after changes.

## Release source provenance

- Before publishing an npm version, commit the reviewed release source and push that exact commit to the authorized remote branch. Confirm the remote branch SHA equals the local release commit before running `npm publish`.
- Each authorized version release includes an annotated `v<version>` tag, all three npm packages, and a published GitHub Release. After source synchronization, create and push the tag at the exact release source commit before npm publication. Never implicitly tag a later branch HEAD or move an existing tag.
- Prepare public notes in `docs/releases/<version>-notes.md` covering changes, npm links, compatibility, verification scope and known limitations. Keep the detailed verification history in `docs/releases/<version>.md`. After verifying all three public package versions and downloaded archive integrity, create the GitHub Release using the existing remote tag: `gh release create v<version> --verify-tag --title "v<version>" --notes-file docs/releases/<version>-notes.md` with the authorized repository explicitly selected.
- Verify the remote tag's peeled commit equals the release source SHA and the GitHub Release has the intended tag, notes and published (not draft) state. Record its public URL. npm publication alone is not release completion: report source synchronization, tag, each npm package, GitHub Release and host/service deployment separately.
- If npm succeeds but GitHub publication fails, report the partial state and complete only the missing authorized step. Do not republish the npm version, recreate a mismatched tag, force-push, or claim a clean audit/full passing suite when accepted limitations remain. Honor explicit instructions to postpone a step rather than claiming the entire release is complete.
- Keep private OAS documents, credentials, local artifacts and company application source out of this public repository. Do not use a broad add command without reviewing its exact file set.
- Commit, push, tag and publication still require the applicable user authorization. If source synchronization is not authorized or is blocked, stop before npm publication and state the blocker.

## Current graph requested by the user

- After each implementation task, update the current-work annotation in `scripts/update-workflow-conversation-graph.mjs` to match verified progress, run `npm run graph:update`, and show the refreshed graph or its stage summary to the user. Keep using `docs/current-conversation-graph.md` instead of creating a new diagram per task.
- Graph topology must come from the actual compiled LangGraph. Register explicit conditional destinations; do not draw hypothetical all-to-all routes or maintain a separate hand-written routing diagram. New nodes require Korean display labels, and the graph-document regression must pass.
- Distinguish the conversation-planning LangGraph from generated n8n execution workflows. Mark work in progress and unverified runtime behavior explicitly; a node's existence does not prove the feature is complete. Do not start a background watcher or call the model merely to refresh a diagram.
