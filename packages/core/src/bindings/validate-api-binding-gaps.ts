import type { ValidateApiBindingPlanInput } from '../types/api-bindings.js';
import { requestBindingSchemas } from './request-binding-schema.js';

export function validateApiBindingGaps({
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
