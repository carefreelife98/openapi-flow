import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';
import { createJsonOutputCapability } from '@openapi-flow/n8n';

/** Deliberate model misclassification followed by a scripted review, not live model quality evidence. */
export function nativeSelectionParentFixture(name, blocked = false) {
  const calls = [],
    progress = [];
  let selections = 0;
  const capabilities = [
    createJsonOutputCapability({
      name: 'confirmed-context',
      description: 'Preserve the actual boolean setting',
      parametersSchema: z.strictObject({ enabled: z.boolean() }),
    }),
  ];
  const instance = {
    capability: 'confirmed-context',
    purpose: 'Preserve enabled false',
    parameterSource: 'literal',
  };
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ name: options.name, payload });
          if (options.name === 'select_native_node_instances') {
            selections++;
            return {
              instances: [instance],
              gaps:
                selections === 1
                  ? [
                      {
                        description:
                          'The enabled setting has not been configured',
                      },
                    ]
                  : [],
            };
          }
          if (options.name === 'review_native_instance_selection')
            return {
              assessments: Object.fromEntries(
                payload.gaps.map((gap) => [
                  gap.id,
                  {
                    kind: blocked
                      ? 'business-decision'
                      : 'native-configuration',
                    ...(blocked
                      ? { question: 'Which business behavior do you want?' }
                      : { capability: 'confirmed-context' }),
                    sourceQuote: 'Keep enabled false.',
                    reason: 'Use only the supplied setting and implementation.',
                  },
                ]),
              ),
            };
          if (options.name === 'generate_native_node_parameters')
            return {
              decision: { status: 'provided', parameters: { enabled: false } },
            };
          if (options.name === 'plan_workflow_connections')
            return { edges: [], additionalGaps: [] };
          throw new Error('Unexpected model call ' + options.name);
        },
      };
    },
  };
  return {
    input: {
      workflowId: name,
      workflowName: 'Preserve original boolean',
      scenario: 'Keep enabled false.',
      sources: [],
      trace: [],
    },
    dependencies: {
      model,
      capabilities,
      nativePlanning: {
        mode: 'staged',
        selectionReview: {
          policy: {
            maxModelInvocations: 3,
            maxReselections: 1,
            deadlineMs: 30_000,
          },
          observe: (event) => progress.push(event),
        },
      },
      checkpointer: new MemorySaver(),
    },
    calls,
    progress,
  };
}
