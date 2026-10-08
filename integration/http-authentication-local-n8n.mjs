import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { URL, URLSearchParams } from 'node:url';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { assembleN8nWorkflow, createHttpRequestNode } from '@openapi-flow/n8n';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-http-auth-${process.pid}-${Date.now()}`;
const token = randomUUID();
const user = 'local-fixture';
const password = randomUUID();
const realm = 'local-oas-contract';
const nonce = randomUUID();
const md5 = (value) => createHash('md5').update(value).digest('hex');
const calls = [];
const failures = [];
let grants = 0;
let challenges = 0;

function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({ code, stdout: Buffer.concat(chunks).toString() }),
    );
    child.stdin.end(input);
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.local');
    if (url.pathname === '/seed') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'runtime-42' }));
      return;
    }
    if (url.pathname === '/token') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      assert.equal(body.get('grant_type'), 'client_credentials');
      assert.equal(body.get('scope'), 'inventory:read');
      assert.equal(
        request.headers.authorization,
        'Basic ' + Buffer.from(user + ':' + password).toString('base64'),
      );
      grants++;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          access_token: token,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      );
      return;
    }
    const mode = url.pathname.slice(1);
    assert.ok(
      ['basic', 'digest', 'bearer', 'header', 'query', 'oauth2'].includes(mode),
    );
    assert.ok(
      ['literal-42', 'runtime-42'].includes(url.searchParams.get('id')),
    );
    if (
      mode === 'digest' &&
      !request.headers.authorization?.startsWith('Digest ')
    ) {
      challenges++;
      response.writeHead(401, {
        'www-authenticate': `Digest realm="${realm}", nonce="${nonce}", qop="auth", algorithm=MD5`,
      });
      response.end();
      return;
    }
    if (mode === 'basic')
      assert.equal(
        request.headers.authorization,
        'Basic ' + Buffer.from(user + ':' + password).toString('base64'),
      );
    if (mode === 'bearer' || mode === 'oauth2')
      assert.equal(request.headers.authorization, 'Bearer ' + token);
    if (mode === 'header')
      assert.equal(request.headers['x-fixture-key'], token);
    if (mode === 'query') assert.equal(url.searchParams.get('api_key'), token);
    if (mode === 'digest') {
      const fields = Object.fromEntries(
        [
          ...request.headers.authorization.matchAll(
            /(\w+)=(?:"([^"]*)"|([^,\s]+))/g,
          ),
        ].map((match) => [
          match[1],
          match[2] === undefined ? match[3] : match[2],
        ]),
      );
      assert.equal(fields.username, user);
      assert.equal(fields.realm, realm);
      assert.equal(fields.nonce, nonce);
      assert.equal(fields.uri, request.url);
      assert.equal(fields.qop, 'auth');
      assert.equal(
        fields.response,
        md5(
          `${md5(`${user}:${realm}:${password}`)}:${nonce}:${fields.nc}:${fields.cnonce}:auth:${md5(`${request.method}:${fields.uri}`)}`,
        ),
      );
    }
    calls.push({ mode, id: url.searchParams.get('id') });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  } catch {
    failures.push('local credential or contract check failed');
    response.writeHead(422);
    response.end('{}');
  }
});

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
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const definitions = {
    bearer: { type: 'http', scheme: 'bearer' },
    basic: { type: 'http', scheme: 'basic' },
    digest: { type: 'http', scheme: 'digest' },
    header: { type: 'apiKey', in: 'header', name: 'X-Fixture-Key' },
    query: { type: 'apiKey', in: 'query', name: 'api_key' },
    oauth2: {
      type: 'oauth2',
      flows: {
        clientCredentials: {
          tokenUrl: baseUrl + '/token',
          scopes: { 'inventory:read': 'Read fixture' },
        },
      },
    },
  };
  const data = {
    bearer: { token },
    basic: { user, password },
    digest: { user, password },
    header: { name: 'X-Fixture-Key', value: token },
    query: { name: 'api_key', value: token },
    oauth2: {
      grantType: 'clientCredentials',
      accessTokenUrl: baseUrl + '/token',
      clientId: user,
      clientSecret: password,
      scope: 'inventory:read',
      authentication: 'header',
    },
  };
  const types = {
    bearer: 'httpBearerAuth',
    basic: 'httpBasicAuth',
    digest: 'httpDigestAuth',
    header: 'httpHeaderAuth',
    query: 'httpQueryAuth',
    oauth2: 'oAuth2Api',
  };
  const paths = {
    '/seed': {
      get: {
        responses: {
          200: {
            description: 'seed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  };
  for (const mode of Object.keys(definitions))
    paths['/' + mode] = {
      get: {
        security: [{ [mode]: mode === 'oauth2' ? ['inventory:read'] : [] }],
        parameters: [
          {
            name: 'id',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { 200: { description: 'ok' } },
      },
    };
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Local authentication', version: '1' },
    components: { securitySchemes: definitions },
    paths,
  };
  const catalog = await createApiCatalog([{ id: 'auth', spec }]);
  const contracts = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  const seed = contracts.find((item) => item.path === '/seed');
  assert.ok(seed);
  const credentials = Object.keys(definitions).map((mode) => ({
    id: `fixture-${mode}`,
    name: `Fixture ${mode}`,
    type: types[mode],
    data: data[mode],
  }));
  const workflows = [];
  for (const mode of Object.keys(definitions))
    for (const bound of [false, true]) {
      const operation = contracts.find((item) => item.path === '/' + mode);
      const nodes = [];
      if (bound)
        nodes.push(
          createHttpRequestNode({
            operation: seed,
            arguments: {
              callId: 'seed',
              values: {},
              bindings: [],
              unresolvedInputs: [],
            },
            baseUrl,
            position: [0, 0],
          }),
        );
      nodes.push(
        createHttpRequestNode({
          operation,
          arguments: {
            callId: 'target',
            values: bound ? {} : { query: { id: 'literal-42' } },
            bindings: bound
              ? [
                  {
                    kind: 'node-output',
                    sourceNodeId: 'seed',
                    sourcePointer: '/id',
                    targetPointer: '/query/id',
                  },
                ]
              : [],
            unresolvedInputs: [],
          },
          baseUrl,
          credentialBindings: {
            [mode]: { id: `fixture-${mode}`, name: `Fixture ${mode}` },
          },
          apiNodeNames: { seed: 'Request seed' },
          position: [300, 0],
        }),
      );
      workflows.push({
        mode,
        bound,
        workflow: assembleN8nWorkflow({
          id: `auth-${mode}-${bound ? 'bound' : 'literal'}`,
          name: `Auth ${mode}`,
          nodes,
          edges: bound
            ? [{ from: 'seed', output: 'main', to: 'target', input: 'main' }]
            : [],
          starts: [bound ? 'seed' : 'target'],
        }).workflow,
      });
    }
  const serialized = JSON.stringify(workflows.map((item) => item.workflow));
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes(password), false);
  assert.equal((await docker(['volume', 'create', volume])).code, 0);
  created = true;
  assert.equal(
    (
      await docker(
        [...runtime, 'import:credentials', '--input=/dev/stdin'],
        JSON.stringify(credentials),
      )
    ).code,
    0,
  );
  assert.equal(
    (
      await docker(
        [...runtime, 'import:workflow', '--input=/dev/stdin'],
        serialized,
      )
    ).code,
    0,
  );
  const results = [];
  for (const item of workflows) {
    const before = calls.length;
    const result = await docker([
      ...runtime,
      'execute',
      '--id=' + item.workflow.id,
      '--rawOutput',
    ]);
    assert.equal(result.code, 0, `local n8n ${item.mode} execution failed`);
    assert.equal(readN8nExecution(result.stdout).status, 'success');
    assert.deepEqual(calls.slice(before), [
      { mode: item.mode, id: item.bound ? 'runtime-42' : 'literal-42' },
    ]);
    assert.deepEqual(failures, []);
    results.push({ mode: item.mode, bound: item.bound, status: 'passed' });
    console.log(
      `${item.mode} ${item.bound ? 'response-bound' : 'literal'}: PASSED`,
    );
  }
  assert.ok(grants > 0);
  assert.ok(challenges > 0);
  const directory = new URL(
    '../.local-artifacts/http-authentication/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('workflows.json', directory), serialized);
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        image,
        results,
        oauthGrants: grants,
        digestChallenges: challenges,
        actualBusinessCalls: 0,
        remoteN8nWrites: 0,
        credentialSecretsInWorkflow: false,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (created) assert.equal((await docker(['volume', 'rm', volume])).code, 0);
}
