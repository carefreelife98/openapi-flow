import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowGenerationGraph,
  createReviewableWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import {
  validateApiInputAnswerAnalysis,
  validateApiLiteralGenerationRecord,
} from '@openapi-flow/core';
import { repeatedCallSources } from './fixtures/repeated-call-literal-fixture.mjs';
import { textInputSource } from './fixtures/api-input-source-selection-fixture.mjs';

function initialInput() {
  const sources = globalThis.structuredClone(repeatedCallSources);
  sources[0].spec.paths['/records/{id}'].get.parameters.push({
    in: 'query',
    name: 'sort',
    schema: { type: 'string', enum: ['VIEWS', 'NEW'], default: 'NEW' },
  });
  return {
    workflowId: 'host-enum',
    workflowName: 'Role-specific OAS enum generation',
    sources,
    scenario:
      '첫 번째 조회 역할은 "fixture-first"를 조회수 순으로, 두 번째 조회 역할은 "fixture-second"를 최신순으로 조회해줘. 두 조회는 독립적이야.',
    trace: [],
  };
}

function hostModel({ repeated = false, unanswered = false } = {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ name: options.name, payload });
          if (options.name === 'select_api_operations')
            return schema.parse({
              operations: [
                { candidateId: 'candidate-1', purpose: '첫 번째 조회 역할' },
                ...(repeated
                  ? [
                      {
                        candidateId: 'candidate-1',
                        purpose: '두 번째 조회 역할',
                      },
                    ]
                  : []),
              ],
              gaps: [],
            });
          if (options.name === 'plan_api_bindings')
            return schema.parse({
              calls: payload.materials.map((material) => ({
                callId: material.callId,
                bindings: [],
              })),
              gaps: [],
            });
          if (options.name === 'generate_api_arguments') {
            assert.ok(schema.shape.requestedInputs);
            assert.ok(schema.shape.literalSources);
            const id =
              payload.purpose === '첫 번째 조회 역할'
                ? 'fixture-first'
                : 'fixture-second';
            return schema.parse({
              values: { path: { id } },
              literalSources: [
                {
                  targetPointer: '/path/id',
                  sourceFormat: 'json',
                  sourceText: JSON.stringify(id),
                },
              ],
              requestedInputs: ['/query/sort'],
              explanation: { reason: '이 역할의 원문 식별자만 복사했습니다.' },
            });
          }
          if (options.name === 'extract_api_input_answers') {
            assert.equal(payload.questions.length, 1);
            assert.equal(payload.questions[0].targetPointer, '/query/sort');
            const first = payload.purpose === '첫 번째 조회 역할';
            const choice = payload.enumChoices[0];
            const candidate = choice.candidates.find(
              (item) => item.value === (first ? 'VIEWS' : 'NEW'),
            );
            assert.ok(candidate);
            return {
              answers: unanswered
                ? []
                : [
                    {
                      requirementId: choice.requirementId,
                      source: {
                        kind: 'oas-enum',
                        candidateId: candidate.id,
                        intent: textInputSource(
                          payload,
                          first ? '조회수' : '최신순',
                        ),
                      },
                      reason: '현재 조회 역할에 맞는 원래 OAS enum입니다.',
                    },
                  ],
              reason: '각 호출 역할의 실제 요청만 해석했습니다.',
            };
          }
          if (options.name === 'plan_reviewable_workflow_graph') {
            assert.ok(
              payload.materials.every(
                (material) =>
                  !Object.hasOwn(material.arguments, 'literalGeneration') &&
                  !Object.hasOwn(material.arguments, 'literalSources') &&
                  !Object.hasOwn(material.arguments, 'enumInterpretation'),
              ),
            );
            return { edges: [], additionalGaps: [], blockedCalls: [] };
          }
          throw new Error(`Unexpected enum host stage ${options.name}`);
        },
      };
    },
  };
}

const argumentOptions = {
  selectOasEnums: true,
  includeExplanations: true,
};

test('single-call reference factory forwards enum options and preserves source-owned arguments', async () => {
  const model = hostModel();
  const result = await createWorkflowGenerationGraph({
    model,
    argumentOptions,
  }).invoke(initialInput());
  const args = result.arguments[0];
  assert.deepEqual(args.values, {
    path: { id: 'fixture-first' },
    query: { sort: 'VIEWS' },
  });
  assert.deepEqual(args.requestedInputs, ['/query/sort']);
  validateApiInputAnswerAnalysis(args.enumInterpretation);
  assert.deepEqual(
    model.calls.map((call) => call.name),
    [
      'select_api_operations',
      'generate_api_arguments',
      'extract_api_input_answers',
    ],
  );
});

test('reviewable reference factory keeps independent enum evidence for repeated roles without forwarding it to graph planning', async () => {
  const model = hostModel({ repeated: true });
  const input = initialInput();
  const result = await createReviewableWorkflowGenerationGraph({
    model,
    capabilities: [],
    argumentOptions,
  }).invoke(input);
  assert.equal(result.status, 'complete');
  assert.deepEqual(
    result.reviewMaterials.map((material) => material.arguments.values),
    [
      { path: { id: 'fixture-first' }, query: { sort: 'VIEWS' } },
      { path: { id: 'fixture-second' }, query: { sort: 'NEW' } },
    ],
  );
  assert.equal(new Set(result.reviewPlan.starts).size, 2);
  assert.deepEqual(result.reviewPlan.edges, []);
  for (const material of result.reviewMaterials) {
    validateApiInputAnswerAnalysis(material.arguments.enumInterpretation);
    validateApiLiteralGenerationRecord({
      ...input,
      callId: material.arguments.callId,
      operation: material.operation,
      bindings: material.arguments.bindings,
      purpose: material.purpose,
      record: material.arguments.literalGeneration,
    });
    assert.deepEqual(material.arguments.unresolvedInputs, []);
  }
  assert.equal(
    model.calls.filter((call) => call.name === 'extract_api_input_answers')
      .length,
    2,
  );
});

test('reviewable reference factory reports an unanswered requested optional enum at the argument-preparation boundary', async () => {
  const model = hostModel({ unanswered: true });
  await assert.rejects(
    createReviewableWorkflowGenerationGraph({
      model,
      capabilities: [],
      argumentOptions,
    }).invoke(initialInput()),
    /Request inputs need user clarification:.*\/query\/sort/,
  );
  assert.equal(
    model.calls.some((call) => call.name === 'plan_reviewable_workflow_graph'),
    false,
  );
});

test('reference factory can track requested inputs without enabling semantic enum selection', async () => {
  const model = hostModel();
  await assert.rejects(
    createReviewableWorkflowGenerationGraph({
      model,
      capabilities: [],
      argumentOptions: {
        trackRequestedInputs: true,
        includeExplanations: true,
      },
    }).invoke(initialInput()),
    /Request inputs need user clarification:.*\/query\/sort/,
  );
  assert.equal(
    model.calls.some((call) => call.name === 'extract_api_input_answers'),
    false,
  );
});
