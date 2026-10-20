import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  describeWorkflowDraftApiCallPlanning,
  resolveWorkflowDraftApiCallBindings,
  describeWorkflowDraftApiCallArguments,
  resolveWorkflowDraftApiCallArguments,
  createWorkflowDraftApiCallArgumentsSchema,
} from '@openapi-flow/core';
import {
  generateWorkflowDraftApiCallArguments,
  WorkflowDraftApiCallPlanningError,
} from '@openapi-flow/langchain';
import { apiLiteralSourceSelections } from './fixtures/api-literal-source-selections.mjs';

async function fixture(text, background = [], includeExplanations = false) {
  const catalog = await createApiCatalog([
    {
      id: 'original',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Literal origin', version: '1' },
        paths: {
          '/read': {
            post: {
              parameters: [
                {
                  in: 'query',
                  name: 'enabled',
                  schema: { type: 'boolean', default: true },
                },
              ],
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: { 200: { description: 'OK' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const message = { id: 'current', text };
  const context = {
    operations: [operation],
    capabilities: [],
    messages: [...background, message],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'origin',
      apiCalls: [],
      nativeNodes: [],
      edges: [],
      requirements: [],
    },
  });
  const sources = [{ kind: 'message', messageId: message.id, quote: text }];
  const base = { context, draft, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations },
    proposal: {
      decisions: [
        {
          kind: 'add-api-call',
          operation: operation.key,
          instruction: 'Use only the explicitly supplied literals.',
          sources,
          ...(includeExplanations
            ? {
                explanation: {
                  reason: 'The request asks for this API.',
                  evidence: sources,
                },
              }
            : {}),
        },
      ],
    },
  });
  const selected = { ...base, plan, stepId: plan.steps[0].id, resolutions: [] };
  const bindingPlan = resolveWorkflowDraftApiCallBindings({
    ...selected,
    fingerprint: describeWorkflowDraftApiCallPlanning(selected).fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        sourceMessageIds: [message.id],
        ...(includeExplanations
          ? {
              explanation: {
                reason: 'No predecessor is requested.',
                evidence: [{ kind: 'message', messageId: message.id }],
              },
            }
          : {}),
      },
    },
  });
  const input = { ...selected, bindingPlan };
  const proposal = (values, literalSources) => ({
    values,
    ...(literalSources === undefined ? {} : { literalSources }),
    sourceMessageIds: [message.id],
    ...(includeExplanations
      ? {
          explanation: {
            reason: 'Use the explicit values.',
            evidence: [{ kind: 'message', messageId: message.id }],
          },
        }
      : {}),
  });
  const resolve = (output) =>
    resolveWorkflowDraftApiCallArguments({
      ...input,
      fingerprint: describeWorkflowDraftApiCallArguments(input).fingerprint,
      proposal: output,
    });
  return { input, proposal, resolve };
}

test('an OAS-valid default invented by the model fails at the Core boundary, not only in a prompt', async () => {
  const f = await fixture('가격 조회도 추가해줘.');
  const values = { query: { enabled: true } };
  assert.equal(
    createWorkflowDraftApiCallArgumentsSchema(f.input).safeParse(
      f.proposal(values, [
        {
          targetPointer: '/values/query/enabled',
          messageId: 'current',
          sourceFormat: 'json',
          sourceText: 'true',
        },
      ]),
    ).success,
    false,
  );
  assert.equal(
    createWorkflowDraftApiCallArgumentsSchema(f.input).safeParse(
      f.proposal(values),
    ).success,
    true,
  );
  assert.throws(
    () => f.resolve(f.proposal(values)),
    /\/query\/enabled.*literalSources/,
  );
  assert.throws(
    () => f.resolve(f.proposal(values, [])),
    /\/query\/enabled.*literalSources/,
  );
  assert.throws(
    () =>
      f.resolve(
        f.proposal(values, apiLiteralSourceSelections(values, 'current')),
      ),
    /sourceText is absent/,
  );
  const output = f.proposal(values);
  let calls = 0;
  await assert.rejects(
    generateWorkflowDraftApiCallArguments({
      ...f.input,
      model: {
        withStructuredOutput() {
          return {
            async invoke() {
              calls++;
              return output;
            },
          };
        },
      },
    }),
    (error) =>
      error instanceof WorkflowDraftApiCallPlanningError &&
      error.failure.output === output &&
      /literalSources/.test(error.cause.message),
  );
  assert.equal(calls, 1);
});

for (const explanations of [false, true])
  test(`nested literal coverage preserves original JSON types and receipts, explanations=${explanations}`, async () => {
    const body = JSON.parse(
      '{"a/b":{"~k":[false,0,null,"",{},[]]},"__proto__":{"safe":"own"}}',
    );
    const f = await fixture(
      `Use body ${JSON.stringify(body)}.`,
      [],
      explanations,
    );
    const values = { body };
    const selected = apiLiteralSourceSelections(values, 'current');
    const result = f.resolve(f.proposal(values, selected));
    assert.deepEqual(result.arguments.values, values);
    assert.equal(
      Object.hasOwn(result.arguments.values.body, '__proto__'),
      true,
    );
    assert.equal(result.literalSources.length, selected.length);
    assert.ok(
      result.literalSources.every((source) => source.occurrences.length),
    );
    assert.equal(Object.hasOwn(result.resolution, 'literalSources'), false);
    assert.throws(
      () => f.resolve(f.proposal(values, selected.slice(1))),
      /literalSources/,
    );
    const whole = [
      {
        targetPointer: '/body',
        messageId: 'current',
        sourceFormat: 'json',
        sourceText: JSON.stringify(body),
      },
    ];
    assert.deepEqual(
      f.resolve(f.proposal(values, whole)).arguments.values,
      values,
    );
    assert.throws(
      () => f.resolve(f.proposal(values, [...whole, selected[0]])),
      /overlapping/,
    );
    assert.throws(
      () => f.resolve(f.proposal(values, [...selected, selected[0]])),
      /overlapping/,
    );
  });

test('source verification rejects conversion, absent pointers, stale messages and partial JSON tokens', async () => {
  const f = await fixture('Use "true", 12 and "001".');
  const source = {
    targetPointer: '/body',
    messageId: 'current',
    sourceFormat: 'json',
    sourceText: '"true"',
  };
  assert.throws(
    () => f.resolve(f.proposal({ body: true }, [source])),
    /without conversion/,
  );
  assert.throws(
    () => f.resolve(f.proposal({ body: 1 }, [{ ...source, sourceText: '1' }])),
    /not a complete literal/,
  );
  assert.throws(
    () =>
      f.resolve(
        f.proposal({ body: 'true' }, [
          { ...source, targetPointer: '/body/missing' },
        ]),
      ),
    /absent proposed value/,
  );
  assert.throws(() =>
    f.resolve(
      f.proposal({ body: 'true' }, [{ ...source, messageId: 'imagined' }]),
    ),
  );
  assert.throws(
    () =>
      f.resolve(
        f.proposal({ body: 'true' }, [
          { ...source, targetPointer: '/bad~pointer' },
        ]),
      ),
    /Invalid JSON Pointer|Invalid string/,
  );
  assert.deepEqual(
    f.resolve(f.proposal({ body: '001' }, [{ ...source, sourceText: '"001"' }]))
      .arguments.values,
    { body: '001' },
  );
});

test('background literal evidence is separate from current edit authority and is fingerprint checked', async () => {
  const f = await fixture('Add the API using the earlier explicit body.', [
    { id: 'earlier', text: 'Use body {"code":"0007"}.' },
  ]);
  const output = f.proposal({ body: { code: '0007' } }, [
    {
      targetPointer: '/body',
      messageId: 'earlier',
      sourceFormat: 'json',
      sourceText: '{"code":"0007"}',
    },
  ]);
  const result = f.resolve(output);
  assert.equal(result.sources[0].messageId, 'current');
  assert.equal(result.literalSources[0].messageId, 'earlier');
  assert.throws(() => f.resolve({ ...output, sourceMessageIds: ['earlier'] }));
  const fingerprint = describeWorkflowDraftApiCallArguments(
    f.input,
  ).fingerprint;
  f.input.context.messages[0].text = 'Changed source text.';
  assert.throws(
    () =>
      resolveWorkflowDraftApiCallArguments({
        ...f.input,
        fingerprint,
        proposal: output,
      }),
    /Draft edit plan is stale or has modified identities, context, stages or decisions/,
  );
});

test('empty actual bodies need a source, while no generated inputs need no fabricated source', async () => {
  const f = await fixture('Use {} or [].');
  assert.deepEqual(f.resolve(f.proposal({})).literalSources, []);
  assert.deepEqual(f.resolve(f.proposal({ query: {} })).literalSources, []);
  for (const body of [{}, []]) {
    assert.throws(
      () => f.resolve(f.proposal({ body })),
      /\/body.*literalSources/,
    );
    const sources = apiLiteralSourceSelections({ body }, 'current');
    assert.deepEqual(
      f.resolve(f.proposal({ body }, sources)).arguments.values,
      { body },
    );
  }
});
