import { isDeepStrictEqual } from 'node:util';
import type {
  CompileWorkflowApiValuesInput,
  CompiledWorkflowApiValues,
  ValidateCompiledWorkflowApiValuesInput,
} from '../../types/workflow-api-values.js';
import { workflowApiValuePlanSchema } from '../../schemas/workflow-api-value-plan-schema.js';
import { fingerprintWorkflowApiValueContext } from './fingerprint-workflow-api-value-context.js';
import { describeApiLiteralGeneration } from './describe-api-literal-generation.js';
import { applyConfirmedApiInputs } from '../clarification/apply-confirmed-api-inputs.js';
import { inspectApiArgumentRequirements } from '../clarification/inspect-api-argument-requirements.js';
import { createApiValueEvidenceResolver } from '../sources/attribute-api-value-evidence.js';
import { runOpenApiFlowOperation } from '../../errors/run-openapi-flow-operation.js';
import { isOpenApiFlowError } from '../../errors/openapi-flow-error.js';

/** Values are OAS-typed proposals; original attribution and per-call outcomes are code-owned. */
export function compileWorkflowApiValues(
  input: CompileWorkflowApiValuesInput,
): CompiledWorkflowApiValues {
  const sourceFingerprint = fingerprintWorkflowApiValueContext(input);
  const plan = workflowApiValuePlanSchema.parse(input.plan);
  if (plan.sourceFingerprint !== sourceFingerprint)
    throw new Error('Workflow values belong to another source revision');
  if (
    Object.keys(plan.calls).length !== input.calls.length ||
    input.calls.some((call) => !Object.hasOwn(plan.calls, call.callId))
  )
    throw new Error('Workflow values must cover exactly their supplied calls');
  const result: CompiledWorkflowApiValues = {
    sourceFingerprint,
    plan: structuredClone(plan),
    arguments: [],
    evidence: {},
    rejections: [],
  };
  const attributeEvidence = createApiValueEvidenceResolver(input);
  for (const call of input.calls) {
    const description = describeApiLiteralGeneration({
      ...call,
      scenario: input.scenario,
      literalSourceMessages: input.messages,
    });
    const proposal = plan.calls[call.callId]!;
    try {
      const checked = runOpenApiFlowOperation(
        {
          owner: 'core',
          operation: 'compileWorkflowApiValues',
          stage: 'contract-validation',
          code: 'API_ARGUMENT_VALIDATION_FAILED',
        },
        () => {
          const proposedValues = description.contract.valuesSchema.parse(
            proposal.values,
          );
          if (!isDeepStrictEqual(proposedValues, proposal.values))
            throw new Error(
              'Workflow values must not be defaulted, coerced or transformed',
            );
          const evidence = attributeEvidence({ call, values: proposedValues });
          const values = applyConfirmedApiInputs({
            ...call,
            values: proposedValues,
          });
          const inspection = inspectApiArgumentRequirements({
            ...call,
            values,
            requestedInputs: proposal.requestedInputs,
          });
          return {
            evidence,
            arguments: {
              callId: call.callId,
              values,
              bindings: structuredClone(call.bindings),
              requestedInputs: [...proposal.requestedInputs],
              unresolvedInputs: inspection.requirements.map(
                (requirement) => requirement.targetPointer,
              ),
              literalSources: evidence.literalSources,
              ...(call.requestMediaType === undefined
                ? {}
                : { requestMediaType: call.requestMediaType }),
            },
          };
        },
      );
      result.arguments.push(checked.arguments);
      result.evidence[call.callId] = checked.evidence;
    } catch (error) {
      if (!isOpenApiFlowError(error)) throw error;
      result.rejections.push({
        callId: call.callId,
        reason: error.message,
        sourceFingerprint: fingerprintWorkflowApiValueContext({
          ...input,
          calls: [call],
        }),
      });
    }
  }
  return result;
}

/** Replay stored data against independently supplied current sources and contracts. */
export function validateCompiledWorkflowApiValues(
  input: ValidateCompiledWorkflowApiValuesInput,
): CompiledWorkflowApiValues {
  const checked = compileWorkflowApiValues({
    ...input,
    plan: input.result.plan,
  });
  if (!isDeepStrictEqual(checked, input.result))
    throw new Error(
      'Compiled workflow values changed or belong to another source revision',
    );
  return checked;
}
