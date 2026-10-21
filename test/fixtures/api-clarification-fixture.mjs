import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { textInputSource } from './api-input-source-selection-fixture.mjs';

export const clarificationSpec = {
  openapi: '3.1.0',
  info: { title: 'Clarification contracts', version: '1' },
  paths: {
    '/members/{id}': {
      get: {
        summary: 'Read member summary',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            description: 'Member identifier',
            schema: { type: 'string', minLength: 2 },
          },
        ],
        responses: {
          200: {
            description: 'Member',
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
    '/members/{id}/detail': {
      get: {
        summary: 'Read full member details',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { 200: { description: 'Details' } },
      },
    },
  },
};

export async function clarificationOperation(spec = clarificationSpec) {
  const catalog = await createApiCatalog([{ id: 'members', spec }]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  return { catalog, operation };
}

export function clarificationModel(options = {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, config) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ name: config.name, payload, schema });
          if (config.name === 'analyze_api_selection') {
            if (options.ambiguous)
              return {
                operations: [],
                gaps: [],
                questions: [
                  {
                    kind: 'single-choice',
                    message: 'Summary or full details?',
                    purpose: 'Read member',
                    candidateIds: payload.candidates.map(
                      (item) => item.candidateId,
                    ),
                  },
                ],
              };
            if (options.missing)
              return {
                operations: [],
                gaps: [{ description: 'No supplied refund API' }],
                questions: [],
              };
            return {
              operations: [
                {
                  candidateId: payload.candidates[0].candidateId,
                  purpose: 'Read member summary',
                },
              ],
              gaps: [],
              questions: [],
            };
          }
          if (config.name === 'generate_api_arguments') return { values: {} };
          if (config.name === 'extract_api_input_answers')
            return {
              answers: [
                {
                  requirementId: payload.questions[0].id,
                  source: textInputSource(
                    payload,
                    options.replyValue ?? 'member-01',
                  ),
                  ...(schema.properties?.reason
                    ? {
                        reason:
                          'The reply explicitly provides the pending member identifier.',
                      }
                    : {}),
                },
              ],
              ...(schema.properties?.reason
                ? {
                    reason:
                      'The pending input is explicitly supplied in this reply.',
                  }
                : {}),
            };
          if (config.name === 'plan_api_bindings')
            return {
              calls: payload.materials.map((item) => ({
                callId: item.callId,
                bindings: [],
              })),
              gaps: [],
            };
          if (config.name === 'plan_workflow_connections')
            return {
              edges: [],
              additionalGaps: [],
              ...(payload.readyCallIds.length ? { blockedCalls: [] } : {}),
            };
          throw new Error(`Unexpected model call ${config.name}`);
        },
      };
    },
  };
}
