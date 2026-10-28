import type { BindingSchema } from '@openapi-flow/core';
import type { ResponseEvaluationRuleContract } from '../../../types/response-evaluation.js';
import { responseEvaluationStatusSchema } from '../../../schemas/response-evaluation-schema.js';

export function createResponseEvaluationOutputSchema(
  descriptions: ResponseEvaluationRuleContract[],
): BindingSchema {
  const entries = descriptions.map(
    ({ rule, valueSchema }, ruleIndex): BindingSchema => {
      const properties: Record<string, BindingSchema> = {
        ruleIndex: { const: ruleIndex },
        source: {
          type: 'object',
          properties: {
            source: { const: rule.source.source },
            nodeId: { const: rule.source.nodeId },
            pointer: { type: 'string' },
          },
          required: ['source', 'nodeId', 'pointer'],
          additionalProperties: false,
        },
        status: {
          enum:
            rule.kind === 'unassessed'
              ? ['undetermined']
              : responseEvaluationStatusSchema.options,
        },
        reason: {
          enum:
            rule.kind === 'unassessed'
              ? ['no-rule', 'missing-value']
              : [
                  'matched-case',
                  'unmatched',
                  'missing-value',
                  'empty-collection',
                ],
        },
      };
      const required = ['ruleIndex', 'source', 'status', 'reason'];
      if (rule.kind === 'compare') {
        if (valueSchema === undefined)
          throw new Error(
            'Evaluation output requires its original value schema',
          );
        properties.actualValue = valueSchema;
        if (rule.measurement === 'array-length')
          properties.measuredValue = { type: 'integer', minimum: 0 };
        properties.matchedCaseIndex = {
          type: 'integer',
          minimum: 0,
          maximum: rule.cases.length - 1,
        };
        properties.policy = {
          type: 'object',
          properties: {
            measurement: { const: rule.measurement },
            otherwise: { const: rule.otherwise },
            cases: {
              type: 'array',
              minItems: rule.cases.length,
              maxItems: rule.cases.length,
              prefixItems: rule.cases.map((entry) => ({
                type: 'object',
                properties: {
                  operator: { const: entry.operator },
                  expected: { const: entry.expected },
                  status: { const: entry.status },
                },
                required: ['operator', 'expected', 'status'],
                additionalProperties: false,
              })),
              items: false,
            },
          },
          required: ['measurement', 'cases', 'otherwise'],
          additionalProperties: false,
        };
        required.push('policy');
      }
      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      };
    },
  );
  return {
    type: 'object',
    properties: {
      checks: {
        type: 'array',
        minItems: descriptions.length,
        items: { anyOf: entries },
      },
      summary: {
        type: 'object',
        properties: Object.fromEntries(
          responseEvaluationStatusSchema.options.map((status) => [
            status,
            { type: 'integer', minimum: 0 },
          ]),
        ),
        required: [...responseEvaluationStatusSchema.options],
        additionalProperties: false,
      },
    },
    required: ['checks', 'summary'],
    additionalProperties: false,
  };
}
