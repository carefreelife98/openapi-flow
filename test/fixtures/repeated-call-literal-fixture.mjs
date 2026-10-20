import assert from 'node:assert/strict';
import { createApiCatalog } from '@openapi-flow/core';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export const repeatedCallScenario =
  '같은 조회 API를 두 번 사용해줘. 첫 번째 조회 역할은 id "fixture-first", 두 번째 조회 역할은 id "fixture-second"를 사용해. 두 조회는 서로 독립적으로 분기해 실행하고 다른 API나 확인·변경 기능은 추가하지 마.';
export const repeatedCallSources = [
  {
    id: 'repeated-lookup',
    spec: {
      openapi: '3.1.1',
      info: { title: 'Repeated role lookup', version: '1' },
      paths: {
        '/records/{id}': {
          get: {
            summary: 'Read a record using its identifier',
            parameters: [
              {
                in: 'path',
                name: 'id',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: {
              200: {
                description: 'The selected record',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { id: { type: 'string' } },
                      required: ['id'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
];

export async function repeatedCallLiteralFixture() {
  const sources = globalThis.structuredClone(repeatedCallSources);
  const catalog = await createApiCatalog(sources);
  return { sources, catalog, scenario: repeatedCallScenario };
}

export function repeatedCallLiteralModel() {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          const payload = JSON.parse(messages[1].content);
          calls.push({ name: options.name, schema, payload });
          if (options.name === 'select_api_operations')
            return schema.parse({
              operations: [
                { candidateId: 'candidate-1', purpose: '첫 번째 조회 역할' },
                { candidateId: 'candidate-1', purpose: '두 번째 조회 역할' },
              ],
              gaps: [],
            });
          if (options.name === 'plan_api_bindings') {
            assert.deepEqual(
              payload.materials.map((material) => material.purpose),
              ['첫 번째 조회 역할', '두 번째 조회 역할'],
            );
            return schema.parse({
              calls: payload.materials.map((material) => ({
                callId: material.callId,
                bindings: [],
              })),
              gaps: [],
            });
          }
          if (options.name === 'generate_api_arguments') {
            assert.ok(
              ['첫 번째 조회 역할', '두 번째 조회 역할'].includes(
                payload.purpose,
              ),
            );
            return schema.parse({
              values: {
                path: {
                  id:
                    payload.purpose === '첫 번째 조회 역할'
                      ? 'fixture-first'
                      : 'fixture-second',
                },
              },
              explanation: {
                reason: '이 호출 역할에 명시된 식별자를 사용했습니다.',
              },
            });
          }
          if (options.name === 'plan_reviewable_workflow_graph') {
            assert.deepEqual(
              payload.materials.map((material) => material.purpose),
              ['첫 번째 조회 역할', '두 번째 조회 역할'],
            );
            assert.ok(
              payload.materials.every(
                (material) =>
                  !Object.hasOwn(material.arguments, 'literalGeneration'),
              ),
            );
            return {
              edges: [],
              additionalGaps: [],
              blockedCalls: [],
            };
          }
          throw new Error(`Unexpected repeated-role stage ${options.name}`);
        },
      };
    },
  };
}
