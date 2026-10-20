import { z } from 'zod';
import { createWorkflowRuntimeInputsSchema } from '@openapi-flow/core';
import type { WorkflowRuntimeInputSlot } from '@openapi-flow/core';
import { createWorkflowInputValueMapSchema } from '../../schemas/workflow-input-value-map-schema.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';
import { compileStandaloneValidator } from '../common/validation/compile-standalone-validator.js';

/** Preserve every original $id and local $ref by compiling slot roots separately. */
export function compileTemplateInputValidators(
  slots: WorkflowRuntimeInputSlot[],
): string {
  const contract = createWorkflowRuntimeInputsSchema(slots);
  const envelope = compileStandaloneValidator({
    schema: z.toJSONSchema(
      createWorkflowInputValueMapSchema(Object.keys(contract.shape)),
      { io: 'input' },
    ),
    globalName: 'OpenApiFlowInputsValidator',
  });
  const values = Object.entries(contract.shape).map(([id, schema], index) => {
    const name = `OpenApiFlowInputSlotValidator${index}`;
    const validator = compileStandaloneValidator({
      schema: z.toJSONSchema(schema, { io: 'input' }),
      globalName: name,
    });
    const slot = slots.find((entry) => entry.id === id)!;
    const presence =
      slot.kind === 'api-request-input' && slot.requestedInputs !== undefined
        ? `\n{const missing=OpenApiFlowRequestRuntime.listMissingRequestedApiInputs({source:${javascriptJsonLiteral('Runtime input ' + id)},rootPointer:${javascriptJsonLiteral(slot.targetPointer)},value:payload.values[${javascriptJsonLiteral(id)}],requestedInputs:${javascriptJsonLiteral(slot.requestedInputs)}});if(missing.length)throw new Error('Workflow input omits scenario-requested inputs: '+missing.join(', '));}`
        : '';
    return `${validator}\nif(!${name}(payload.values[${javascriptJsonLiteral(id)}]))throw new Error('Workflow inputs do not match declared slots: '+${javascriptJsonLiteral(id)}+': '+JSON.stringify(${name}.errors));${presence}`;
  });
  return `${envelope}\nif(!OpenApiFlowInputsValidator(payload.values))throw new Error('Workflow inputs do not match declared slots: '+JSON.stringify(OpenApiFlowInputsValidator.errors));\n${values.join('\n')}`;
}
