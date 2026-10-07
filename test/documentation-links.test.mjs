import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import test from 'node:test';

const guides = [
  'README.md',
  'docs/code-walkthrough.ko.md',
  'docs/composable-api-design.ko.md',
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
