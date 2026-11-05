import assert from 'node:assert/strict';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { requestOperation } from './api-argument-generation-fixture.mjs';

export async function literalGenerationFixture() {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    required: ['id', 'quantity'],
    properties: {
      id: {
        type: 'string',
        description:
          'Confirmed-input definition must not reach the literal model',
      },
      quantity: { type: 'integer', minimum: 1, default: 7 },
      enabled: { type: 'boolean' },
      notes: { type: ['string', 'null'] },
      tags: { type: 'array', items: { type: 'string' } },
    },
  });
  return {
    callId: 'literal-consumer',
    operation,
    bindings: [],
    requestMediaType: 'application/json',
    scenario: '첫 번째 역할에는 수량 2, 두 번째 역할에는 수량 5를 사용해줘.',
    purpose: '첫 번째 역할',
    confirmedInputs: [
      {
        callId: 'literal-consumer',
        operation: operation.key,
        targetPointer: '/body/id',
        value: 'confirmed-original',
      },
    ],
  };
}

export function literalGenerationModel(output, observe = () => {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          const call = {
            schema,
            options,
            payload: JSON.parse(messages[1].content),
          };
          calls.push(call);
          await observe(call);
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}
