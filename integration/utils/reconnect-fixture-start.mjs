import assert from 'node:assert/strict';

/** Test-only partial-execution probe: SDK fragment entry is not its logical exit. */
export function reconnectFixtureStart(workflow, rootFragment) {
  const starts = workflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.manualTrigger',
  );
  assert.equal(starts.length, 1);
  const start = starts[0];
  const entry = rootFragment.entry;
  assert.ok(
    entry?.name &&
      workflow.nodes.some(
        (node) => node.id === entry.id && node.name === entry.name,
      ),
  );
  assert.equal(workflow.connections[start.name], undefined);
  const connected = globalThis.structuredClone(workflow);
  connected.connections[start.name] = {
    main: [[{ node: entry.name, type: 'main', index: 0 }]],
  };
  return connected;
}
