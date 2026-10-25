import type { ValidateApiBindingPlanInput } from '../types/api-bindings.js';
import { requestBindingSchemas } from './request-binding-schema.js';
import { runOpenApiFlowOperation } from '../errors/run-openapi-flow-operation.js';

export function validateApiBindingGaps(
  input: ValidateApiBindingPlanInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateApiBindingGaps',
      stage: 'contract-validation',
      code: 'API_BINDING_GAP_INVALID',
    },
    () => validateApiBindingGapContracts(input),
  );
}

function validateApiBindingGapContracts({
  plan,
  materials,
}: ValidateApiBindingPlanInput): void {
  for (const gap of plan.gaps) {
    const material = materials.find((item) => item.callId === gap.callId);
    if (!material || !gap.description.trim())
      throw new Error('binding gap requires a declared callId and description');
    if (!requestBindingSchemas(material, gap.targetPointer).length)
      throw new Error(
        `binding gap ${gap.callId}${gap.targetPointer} is not declared by the request OAS`,
      );
  }
}
