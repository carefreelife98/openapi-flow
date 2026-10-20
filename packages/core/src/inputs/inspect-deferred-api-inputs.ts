import type {
  DeferredApiInputInspection,
  DeferredApiInputIssue,
  InspectDeferredApiInputsInput,
} from '../types/deferred-api-inputs.js';
import type { ApiCallArguments } from '../types/api-arguments.js';
import { deferredApiInputValuesSchema } from '../schemas/deferred-api-input-schema.js';
import { collectDeferredApiInputSlots } from './collect-deferred-api-input-slots.js';
import { createOasValueValidator } from '../openapi/common/create-oas-value-validator.js';
import { assignApiInputValue } from '../arguments/clarification/assign-api-input-value.js';
import { validateApiArguments } from '../arguments/validate-api-arguments.js';
import { listMissingRequestedApiInputs } from '../arguments/clarification/list-missing-requested-api-inputs.js';

/** Missing values are explicit state; malformed supplied values are never repaired. */
export function inspectDeferredApiInputs(
  input: InspectDeferredApiInputsInput,
): DeferredApiInputInspection {
  const slots = collectDeferredApiInputSlots(input);
  const parsed = deferredApiInputValuesSchema.safeParse(input.inputValues);
  if (!parsed.success)
    return {
      status: 'invalid-input',
      slots,
      issues: parsed.error.issues.map((issue) => ({
        code: 'invalid-value',
        inputId: String(issue.path[0] ?? ''),
        message: `inputValues must contain JSON values: ${issue.message}`,
      })),
    };
  const values = parsed.data;
  const known = new Set(slots.map((slot) => slot.id));
  const issues: DeferredApiInputIssue[] = Object.keys(values)
    .filter((id) => !known.has(id))
    .map((inputId) => ({
      code: 'unknown-input',
      inputId,
      message: `inputValues contains undeclared or stale input slot ${inputId}`,
    }));
  for (const slot of slots) {
    if (!Object.hasOwn(values, slot.id)) {
      issues.push({
        code: 'missing-input',
        inputId: slot.id,
        callId: slot.callId,
        targetPointer: slot.targetPointer,
        message: `Missing runtime input ${slot.id} for ${slot.callId}${slot.targetPointer}`,
      });
      continue;
    }
    const checked = createOasValueValidator(
      slot.schema,
      slot.openapiVersion.startsWith('3.0.') ? 'openapi-3.0' : 'draft-2020-12',
      `inputValues[${slot.id}] for ${slot.callId}${slot.targetPointer}`,
    ).validate(values[slot.id]);
    if (!checked.valid)
      issues.push({
        code: 'invalid-value',
        inputId: slot.id,
        callId: slot.callId,
        targetPointer: slot.targetPointer,
        message: `Runtime input ${slot.id} for ${slot.callId}${slot.targetPointer} violates its OAS schema: ${checked.errors.map((issue) => issue.message).join('; ')}`,
      });
    else {
      const missing = listMissingRequestedApiInputs({
        source: `Runtime input ${slot.id}`,
        rootPointer: slot.targetPointer,
        value: values[slot.id],
        requestedInputs: slot.requestedInputs,
      });
      if (missing.length)
        issues.push({
          code: 'invalid-value',
          inputId: slot.id,
          callId: slot.callId,
          targetPointer: slot.targetPointer,
          message: `Runtime input omits scenario-requested inputs: ${missing.join(', ')}`,
        });
    }
  }
  if (issues.length)
    return {
      status: issues.every((issue) => issue.code === 'missing-input')
        ? 'needs-input'
        : 'invalid-input',
      slots,
      issues,
    };
  const args: ApiCallArguments[] = input.materials.map((material) => {
    const resolved = structuredClone(material.values);
    for (const slot of slots.filter((slot) => slot.callId === material.callId))
      assignApiInputValue(
        resolved,
        slot.targetPointer,
        values[slot.id],
        material,
      );
    // Preserve the complete original OAS check after slot assignment. A union
    // projection for one field never substitutes for the final request contract.
    const checked = validateApiArguments({ ...material, values: resolved });
    if (!checked.valid)
      throw new Error(
        `Resolved request ${material.callId} still requires ${checked.missingInputs.join(', ')}`,
      );
    return {
      callId: material.callId,
      values: resolved,
      bindings: structuredClone(material.bindings),
      unresolvedInputs: [],
      ...(material.requestMediaType !== undefined
        ? { requestMediaType: material.requestMediaType }
        : {}),
      ...(material.requestedInputs === undefined
        ? {}
        : { requestedInputs: structuredClone(material.requestedInputs) }),
    };
  });
  return { status: 'ready', slots, arguments: args, issues: [] };
}
