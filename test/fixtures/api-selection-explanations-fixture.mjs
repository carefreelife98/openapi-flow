import assert from 'node:assert/strict';
import { createApiCatalog, listApiOperations } from '@openapi-flow/core';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export async function apiSelectionExplanationsFixture() {
  const sources = ['simple-members', 'full-members', 'addresses'].map(
    (id, index) => ({
      id,
      spec: {
        openapi: '3.1.1',
        info: { title: id, version: '1' },
        paths: {
          [index === 2 ? '/addresses/{id}' : '/members/{id}']: {
            get: {
              summary: [
                '회원 간단 정보 조회',
                '회원 상세 정보 조회',
                '회원 주소 조회',
              ][index],
              description: `Declared discovery metadata for ${id}`,
              tags: [id],
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                200: {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          contractOnlyField: { type: 'string' },
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
    }),
  );
  const catalog = await createApiCatalog(sources);
  return {
    catalog,
    context: {
      scenario: '회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.',
      operations: listApiOperations(catalog),
    },
  };
}

export function apiSelectionExplanationModel(proposal, observe = () => {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          await observe({ schema, options, payload });
          return globalThis.structuredClone(proposal);
        },
      };
    },
  };
}
