import { z } from 'zod';
import { createJsonOutputCapability } from '@openapi-flow/n8n';

export const stagedHostParametersSchema = z.strictObject({
  message: z.string(),
  count: z.number().int(),
});
export const stagedHostCapabilities = () => [
  createJsonOutputCapability({
    name: 'typed-context',
    description:
      'Explicit message and a typed count supplied before execution.',
    parametersSchema: stagedHostParametersSchema,
  }),
  createJsonOutputCapability({
    name: 'independent-context',
    description: 'An independent, explicitly empty JSON object.',
    parametersSchema: z.strictObject({}),
  }),
];

export const stagedHostApiSource = {
  id: 'staged-api',
  spec: {
    openapi: '3.1.0',
    info: { title: 'Staged native host echo', version: '1' },
    paths: {
      '/echo': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: z.toJSONSchema(stagedHostParametersSchema),
              },
            },
          },
          responses: {
            200: {
              description: 'Unchanged input',
              content: {
                'application/json': {
                  schema: z.toJSONSchema(stagedHostParametersSchema),
                },
              },
            },
          },
        },
      },
    },
  },
};

export function stagedHostInput(id, api = false) {
  return {
    workflowId: id,
    workflowName: 'Staged native settings',
    scenario:
      'Create typed context with a message that needs clarification and count supplied at execution. Also create the independent empty context. If the echo API is supplied, send the typed context unchanged to it.',
    sources: api ? [stagedHostApiSource] : [],
    trace: [],
  };
}

/** A deterministic boundary fixture; it is not a live-model quality result. */
export function scriptedStagedHostModel(options = {}) {
  const calls = [];
  let failure = options.answerFailure;
  let typedNodeId;
  const reasons = options.explanations
    ? {
        reason:
          'Use only the explicitly requested typed role and runtime field.',
      }
    : {};
  return {
    calls,
    withStructuredOutput(schema, configuration) {
      return {
        async invoke(messages) {
          const input = JSON.parse(messages[1].content);
          calls.push({ name: configuration.name, input, schema });
          if (configuration.name === 'select_native_node_instances')
            return {
              instances: [
                {
                  capability: 'typed-context',
                  purpose: 'typed request context',
                  parameterSource: 'workflow-fields',
                  pointers: ['/count'],
                  ...reasons,
                },
                ...(options.repeatRole
                  ? [
                      {
                        capability: 'typed-context',
                        purpose: 'second typed request context',
                        parameterSource: 'workflow-fields',
                        pointers: ['/count'],
                        ...reasons,
                      },
                    ]
                  : []),
                {
                  capability: 'independent-context',
                  purpose: 'independent empty context',
                  parameterSource: 'literal',
                  ...reasons,
                },
              ],
              gaps: [],
              ...reasons,
            };
          if (configuration.name === 'generate_native_node_parameters') {
            typedNodeId = input.target.id;
            if (options.knownMessage !== undefined)
              return {
                decision: {
                  status: 'provided',
                  parameters: { message: options.knownMessage },
                  ...reasons,
                },
              };
            if (!input.replies?.length)
              return {
                decision: {
                  status: 'needs-clarification',
                  message: '어떤 메시지를 사용할까요?',
                  ...reasons,
                },
              };
            if (failure) {
              const error = failure;
              failure = undefined;
              throw error;
            }
            return {
              decision: {
                status: 'provided',
                parameters: { message: input.replies.at(-1).text },
                ...reasons,
              },
            };
          }
          if (
            configuration.name === 'select_api_operations' ||
            configuration.name === 'analyze_api_selection'
          )
            return {
              operations: input.candidates.map((candidate) => ({
                candidateId: candidate.candidateId,
                purpose: 'Send typed original values unchanged',
              })),
              gaps: [],
              ...(configuration.name === 'analyze_api_selection'
                ? { questions: [] }
                : {}),
            };
          if (configuration.name === 'plan_api_bindings')
            return {
              calls: input.materials.map((material) => ({
                callId: material.callId,
                bindings: [
                  {
                    kind: 'node-output',
                    sourceNodeId: typedNodeId,
                    sourcePointer: '',
                    targetPointer: '/body',
                  },
                ],
              })),
              gaps: [],
            };
          if (configuration.name === 'plan_workflow_connections')
            return {
              edges: input.readyCallIds.map((callId) => ({
                from: input.nativeNodes.find(
                  (node) => node.capability === 'typed-context',
                ).id,
                output: 'main',
                to: callId,
                input: 'main',
              })),
              additionalGaps: [],
              ...(input.readyCallIds.length ? { blockedCalls: [] } : {}),
            };
          throw new Error(
            'Unexpected fixture model stage ' + configuration.name,
          );
        },
      };
    },
  };
}
