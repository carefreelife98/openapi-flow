import { isDeepStrictEqual } from 'node:util';
import { validateNativeOutputContracts } from '@openapi-flow/core';
import type { JsonValueObject } from '@openapi-flow/core';
import type { CreateResponseEvaluationCapabilityInput } from '../../../types/response-evaluation.js';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import { responseEvaluationParametersSchema } from '../../../schemas/response-evaluation-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { responseEvaluationDefinition } from './response-evaluation-definition.js';
import { describeResponseEvaluationRule } from './describe-response-evaluation-rule.js';
import { createResponseEvaluationOutputSchema } from './create-response-evaluation-output-schema.js';
import { compileResponseEvaluation } from './compile-response-evaluation.js';

export function createResponseEvaluationCapability(
  input: CreateResponseEvaluationCapabilityInput,
): N8nNativeCapability {
  if (input.itemMode !== undefined && input.itemMode !== 'linked')
    throw new Error('Response evaluation itemMode must be linked or omitted');
  if (
    !input.sources ||
    !Array.isArray(input.sources.apiMaterials) ||
    !Array.isArray(input.sources.nativeOutputs)
  )
    throw new Error(
      'Response evaluation requires explicit apiMaterials and nativeOutputs arrays',
    );
  validateNativeOutputContracts(input.sources.nativeOutputs);
  const sources = structuredClone(input.sources);
  const ids = [
    ...sources.apiMaterials.map((entry) => entry.callId),
    ...sources.nativeOutputs.map((entry) => entry.nodeId),
  ];
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string' || !id.trim())
  )
    throw new Error(
      'Response evaluation requires unique actual source identities',
    );
  const describe = (value: JsonValueObject) =>
    responseEvaluationParametersSchema
      .parse(value)
      .checks.map((rule) => describeResponseEvaluationRule(rule, sources));
  return defineMaterialBoundCapability({
    ...responseEvaluationDefinition,
    materialSources: sources,
    bindMaterialContracts: (materialSources) =>
      createResponseEvaluationCapability({
        sources: materialSources,
        itemMode: input.itemMode,
      }),
    responseReferences: (value) =>
      describe(value).flatMap(({ rule }) =>
        rule.source.source === 'response' ? [{ ...rule.source }] : [],
      ),
    nodeOutputReferences: (value) =>
      describe(value).flatMap(({ rule }) =>
        rule.source.source === 'node-output' ? [{ ...rule.source }] : [],
      ),
    outputSchema: (value) =>
      createResponseEvaluationOutputSchema(describe(value)),
    compile: (compiled) => {
      const parameters = responseEvaluationParametersSchema.parse(
        compiled.planned.parameters,
      );
      describe(compiled.planned.parameters);
      for (const { source } of parameters.checks) {
        const original =
          source.source === 'response'
            ? sources.apiMaterials.find(
                (entry) => entry.callId === source.nodeId,
              )?.operation
            : sources.nativeOutputs.find(
                (entry) => entry.nodeId === source.nodeId,
              )?.schema;
        const current =
          source.source === 'response'
            ? compiled.apiResponseContracts?.[source.nodeId]
            : compiled.nativeOutputSources?.find(
                (entry) => entry.nodeId === source.nodeId,
              )?.schema;
        if (!isDeepStrictEqual(original, current))
          throw new Error(
            `Evaluation source contract changed for ${source.nodeId}`,
          );
      }
      return compileResponseEvaluation({
        ...compiled,
        parameters,
        linked: input.itemMode === 'linked',
      });
    },
  });
}
