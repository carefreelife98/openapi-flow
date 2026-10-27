import {
  createApiCatalog,
  resolveApiOperations,
  resolveNativeInstanceSelection,
} from '@openapi-flow/core';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';

export async function nativeSelectionReviewFixture() {
  const scenario =
    'Fetch the metrics API. Check pending connections against my threshold. Keep the original response.';
  const catalog = await createApiCatalog([
    {
      id: 'metrics',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Metrics contract', version: '1' },
        paths: {
          '/metrics': {
            get: {
              responses: {
                200: {
                  description: 'Metrics',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { pending: { type: 'integer' } },
                        required: ['pending'],
                        additionalProperties: false,
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
  ]);
  const [operation] = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const input = {
    planId: 'native-review',
    scenario,
    apiMaterials: [{ callId: 'metrics', operation }],
    capabilities: resolveN8nNativeFeatures({ features: [N8nNativeFeature.If] })
      .capabilities,
  };
  const proposal = {
    instances: [
      {
        capability: 'if',
        purpose: 'Check the pending connection threshold',
        parameterSource: 'literal',
      },
    ],
    gaps: [
      { description: 'The threshold has not yet been supplied.' },
      {
        description: 'There is no native HTTP implementation to call metrics.',
      },
    ],
  };
  const selection = resolveNativeInstanceSelection({ ...input, proposal });
  const [threshold, request] = selection.gaps.map((gap) => gap.id);
  const reviewProposal = {
    assessments: {
      [threshold]: {
        kind: 'native-configuration',
        capability: 'if',
        sourceQuote: 'Check pending connections against my threshold.',
        reason:
          'The supplied IF implementation needs the actual threshold in its value stage.',
      },
      [request]: {
        kind: 'api-planning',
        callIds: ['metrics'],
        sourceQuote: 'Fetch the metrics API.',
        reason:
          'The selected OAS call is implemented separately from native roles.',
      },
    },
  };
  return { input, selection, proposal, reviewProposal };
}
