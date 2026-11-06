import type {
  CompileWorkflowApiArgumentsInput,
  CompiledWorkflowApiArguments,
  VerifiedWorkflowInput,
} from '../../types/workflow-api-arguments.js';
import type { ApiArgumentValues } from '../../types/api-arguments.js';
import { workflowApiArgumentPlanSchema } from '../../schemas/workflow-api-argument-plan-schema.js';
import { validateWorkflowInputCatalog } from '../sources/create-workflow-input-catalog.js';
import { resolvePreparedWorkflowInputSelection } from '../sources/resolve-workflow-input-selection.js';
import { fingerprintWorkflowApiArgumentContext } from './fingerprint-workflow-api-argument-context.js';
import { describeApiLiteralGeneration } from './describe-api-literal-generation.js';
import { describeApiLiteralTargets } from '../sources/describe-api-literal-targets.js';
import { resolveApiLiteralProposalSources } from '../sources/resolve-api-literal-proposal-sources.js';
import { assignApiInputValue } from '../clarification/assign-api-input-value.js';
import { applyConfirmedApiInputs } from '../clarification/apply-confirmed-api-inputs.js';
import { inspectApiArgumentRequirements } from '../clarification/inspect-api-argument-requirements.js';
import { createApiLiteralGenerationRecord } from './create-api-literal-generation-record.js';
import { runOpenApiFlowOperation } from '../../errors/run-openapi-flow-operation.js';
import { isOpenApiFlowError } from '../../errors/openapi-flow-error.js';
import { describeWorkflowApiArgumentTargets } from './describe-workflow-api-argument-targets.js';
import { resolveBindingPointerTemplate } from '../../bindings/candidates/resolve-binding-pointer-template.js';

/** Compile shared references. A rejected call does not erase independently checked calls. */
export function compileWorkflowApiArguments(
  input: CompileWorkflowApiArgumentsInput,
): CompiledWorkflowApiArguments {
  const catalog = validateWorkflowInputCatalog(input.catalog);
  const plan = workflowApiArgumentPlanSchema.parse(input.plan);
  const sourceFingerprint = fingerprintWorkflowApiArgumentContext(input);
  if (plan.sourceFingerprint !== sourceFingerprint)
    throw new Error(
      'Workflow API argument plan belongs to another input revision',
    );
  if (
    !input.calls.length ||
    new Set(input.calls.map((call) => call.callId)).size !== input.calls.length
  )
    throw new Error(
      'Workflow API arguments require distinct nonempty call identities',
    );
  if (
    Object.keys(plan.calls).length !== input.calls.length ||
    input.calls.some((call) => !Object.hasOwn(plan.calls, call.callId))
  )
    throw new Error(
      'Workflow API argument plan must cover exactly its declared calls',
    );
  const descriptions = input.calls.map((call) =>
    describeApiLiteralGeneration({
      ...call,
      scenario: input.scenario,
      literalSourceMessages: catalog.messages,
    }),
  );
  const selected = new Map<string, VerifiedWorkflowInput>();
  const result: CompiledWorkflowApiArguments = {
    sourceFingerprint,
    plan: structuredClone(plan),
    inputs: [],
    arguments: [],
    rejections: [],
  };
  for (const description of descriptions) {
    const call = description.input;
    const proposal = plan.calls[call.callId]!;
    const candidates = describeWorkflowApiArgumentTargets(call);
    try {
      const args = runOpenApiFlowOperation(
        {
          owner: 'core',
          operation: 'compileWorkflowApiArguments',
          stage: 'contract-validation',
          code: 'API_ARGUMENT_VALIDATION_FAILED',
        },
        () => {
          const assignments = proposal.assignments.map((assignment) => {
            const candidate = candidates.find(
              (entry) => entry.id === assignment.targetId,
            );
            if (candidate === undefined)
              throw new Error(
                `Workflow call ${call.callId} has an unknown target reference`,
              );
            return {
              source: assignment.source,
              targetPointer: resolveBindingPointerTemplate(
                candidate.template,
                assignment.targetSelections,
              ),
            };
          });
          const targets = assignments.length
            ? describeApiLiteralTargets(
                description.contract,
                assignments.map((assignment) => assignment.targetPointer),
              )
            : [];
          const values: ApiArgumentValues = {};
          const sources = assignments.map((assignment) => {
            const key = JSON.stringify(assignment.source);
            let verified = selected.get(key);
            if (verified === undefined) {
              verified = resolvePreparedWorkflowInputSelection(
                catalog,
                assignment.source,
              );
              selected.set(key, verified);
            }
            const target = targets.find(
              (entry) => entry.targetPointer === assignment.targetPointer,
            );
            if (target === undefined)
              throw new Error(
                `Workflow call ${call.callId} has no target ${assignment.targetPointer}`,
              );
            const checked = target.valueSchema.safeParse(verified.value);
            if (!checked.success)
              throw new Error(
                `Workflow input (${Array.isArray(verified.value) ? 'array' : verified.value === null ? 'null' : typeof verified.value}) does not satisfy OAS target ${assignment.targetPointer}`,
                { cause: checked.error },
              );
            assignApiInputValue(
              values,
              assignment.targetPointer,
              verified.value,
              call,
            );
            return {
              ...verified.source,
              targetPointer: assignment.targetPointer,
            };
          });
          const literalValues = description.contract.valuesSchema.parse(values);
          const literalSources = resolveApiLiteralProposalSources({
            callId: call.callId,
            values: literalValues,
            messages: catalog.messages,
            sources,
          });
          const finalValues = applyConfirmedApiInputs({
            ...call,
            values: literalValues,
          });
          const inspection = inspectApiArgumentRequirements({
            ...call,
            values: finalValues,
            requestedInputs: proposal.requestedInputs,
          });
          return {
            callId: call.callId,
            values: finalValues,
            bindings: structuredClone(call.bindings),
            requestedInputs: proposal.requestedInputs,
            unresolvedInputs: inspection.requirements.map(
              (requirement) => requirement.targetPointer,
            ),
            literalSources,
            literalGeneration: createApiLiteralGenerationRecord({
              ...call,
              ...(description.contract.hasLiteralInputs
                ? {
                    proposal: { values: literalValues },
                    ...(proposal.reason === undefined
                      ? {}
                      : { reason: proposal.reason }),
                  }
                : {}),
            }),
            ...(call.requestMediaType === undefined
              ? {}
              : { requestMediaType: call.requestMediaType }),
          };
        },
      );
      result.arguments.push(args);
    } catch (error) {
      if (!isOpenApiFlowError(error)) throw error;
      result.rejections.push({
        callId: call.callId,
        reason: error.message,
        sourceFingerprint: fingerprintWorkflowApiArgumentContext({
          ...input,
          calls: [call],
        }),
      });
    }
  }
  result.inputs = [
    ...new Map(
      [...selected.values()].map((entry) => [entry.id, entry]),
    ).values(),
  ];
  return result;
}
