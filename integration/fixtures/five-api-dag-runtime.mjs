import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { runDocker } from '../utils/run-docker.mjs';
import { readN8nExecution } from '../utils/read-n8n-execution.mjs';

/** Synthetic OAS contract/runtime only; never calls business services or changes workflow data. */
export async function createFiveApiDagRuntime(runId) {
  assert.ok(typeof runId === 'string' && /^[a-z0-9-]+$/.test(runId));
  const image = 'n8nio/n8n:2.37.10',
    volume = `openapi-flow-five-api-${runId}`;
  const requests = [],
    failures = [];
  let source;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    try {
      const url = new URL(request.url, 'http://fixture.local');
      const received = {
        method: request.method,
        path: url.pathname,
        query: [...url.searchParams],
        ...(raw ? { body: JSON.parse(raw) } : {}),
      };
      requests.push(received);
      let body;
      if (url.pathname === '/source') {
        assert.equal(request.method, 'GET');
        body = source;
      } else if (url.pathname.startsWith('/detail/')) {
        assert.equal(request.method, 'GET');
        assert.equal(decodeURIComponent(url.pathname.slice(8)), source.id);
        body = { id: source.id };
      } else if (url.pathname === '/price') {
        assert.equal(request.method, 'GET');
        assert.equal(url.searchParams.get('id'), source.id);
        assert.equal(url.searchParams.get('labels'), source.labels.join('|'));
        assert.equal(
          url.searchParams.get('filter[R]'),
          String(source.filter.R),
        );
        body = { price: 12.5 };
      } else if (url.pathname === '/stock') {
        assert.equal(request.method, 'GET');
        assert.equal(url.searchParams.get('id'), source.id);
        body = { stock: 0 };
      } else if (url.pathname === '/summary') {
        assert.equal(request.method, 'POST');
        assert.deepEqual(received.body, {
          id: source.id,
          price: 12.5,
          stock: 0,
          labels: source.labels,
          filter: source.filter,
        });
        body = received.body;
      } else throw new Error('Unexpected fixture path ' + url.pathname);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch (error) {
      failures.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const made = await runDocker(['volume', 'create', volume]);
  if (made.code !== 0) {
    await new Promise((resolve) => server.close(resolve));
    assert.equal(made.code, 0, made.stderr);
  }
  const runtime = [
    'run',
    '--rm',
    '-i',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    image,
  ];
  return {
    image,
    baseUrl: `http://host.docker.internal:${server.address().port}`,
    requests,
    failures,
    async execute(workflow, explicitSource) {
      source = globalThis.structuredClone(explicitSource);
      const offset = requests.length;
      const imported = await runDocker(
        [...runtime, 'import:workflow', '--input=/dev/stdin'],
        JSON.stringify([workflow]),
      );
      assert.equal(imported.code, 0, imported.stderr);
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${workflow.id}`,
        '--rawOutput',
      ]);
      assert.equal(raw.code, 0, raw.stderr);
      const execution = readN8nExecution(raw.stdout);
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.equal(requests.length - offset, 5);
      assert.deepEqual(failures, []);
      assert.equal(
        requests.slice(offset).filter((r) => r.path === '/summary').length,
        1,
      );
      return { source: globalThis.structuredClone(source), execution };
    },
    async close() {
      try {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      } finally {
        const removed = await runDocker(['volume', 'rm', volume]);
        assert.equal(removed.code, 0, removed.stderr);
      }
    },
  };
}
