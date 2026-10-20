import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import test from 'node:test';

const guides = [
  'README.md',
  'docs/current-conversation-graph.md',
  'docs/code-walkthrough.ko.md',
  'docs/composable-api-design.ko.md',
  'docs/api-selection-explanations.md',
  'docs/request-media-decisions.md',
  'docs/literal-generation-records.md',
  'docs/binding-planning-records.md',
  'docs/native-planning-records.md',
  'docs/connection-planning-records.md',
  'docs/graph-planning-records.md',
  'docs/api-input-answer-extraction.md',
  'docs/workflow-draft-requirement-restoration.md',
  'docs/canonical-natural-input-replies.md',
  'docs/canonical-short-followup-verification.md',
  'docs/canonical-api-literal-sources.md',
  'docs/native-feature-registry.md',
  'docs/native-feature-planning.md',
  'docs/native-reference-structure.md',
  'docs/native-material-snapshots.md',
  'docs/workflow-draft-native-node-addition.md',
  'docs/workflow-draft-api-call-planning.md',
  'docs/workflow-draft-conversation-host.md',
  'docs/workflow-review-suggestions.md',
  'docs/workflow-clarification-answer-revisions.md',
  'docs/workflow-draft-api-binding-questions.md',
  'docs/workflow-draft-requirement-history.md',
  'docs/workflow-draft-requirement-edits.md',
  'docs/workflow-draft-clarification-ownership.md',
  'docs/workflow-draft-api-input-edits.md',
  'docs/workflow-draft-api-binding-edits.md',
  'docs/workflow-draft-connection-edits.md',
  'docs/workflow-draft-native-parameter-edits.md',
  'docs/workflow-draft-native-reference-repairs.md',
  'docs/conversational-oss-implementation.md',
  'packages/n8n/README.md',
  'packages/core/README.md',
  'packages/langchain/README.md',
  'examples/langgraph-workflow/README.md',
];

test('current usage guides link to existing local source and documentation', async () => {
  for (const guide of guides) {
    const file = new URL('../' + guide, import.meta.url);
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
      const destination = new URL(target.split('#')[0], file);
      await assert.doesNotReject(
        access(destination),
        `${guide} links to missing file: ${target}`,
      );
    }
  }
});
