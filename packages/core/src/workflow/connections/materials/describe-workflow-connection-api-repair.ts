import { isDeepStrictEqual } from 'node:util';
import type {
  DescribeWorkflowConnectionApiRepairInput,
  WorkflowConnectionApiRepairDescription,
} from '../../../types/workflow-connection-material-repair.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import { validateWorkflowConnectionSourceRepairRequest } from './prepare-connection-material-replacement.js';
import { describeWorkflowConnectionMaterialRepairWork } from './describe-workflow-connection-material-repair-work.js';
import { describeApiCallBindingPlanning } from '../../../bindings/planning/describe-api-call-binding-planning.js';
import { describeApiLiteralGeneration } from '../../../arguments/generation/describe-api-literal-generation.js';
import { connectionValueFingerprint } from '../incremental/connection-graph-identity.js';
import { apiLiteralSourceContextSchema } from '../../../schemas/api-literal-generation-schema.js';

/** Validate the actual originating planner input, not just a model's repair label. No material is adopted. */
export function describeWorkflowConnectionApiRepair(
  input: DescribeWorkflowConnectionApiRepairInput,
): WorkflowConnectionApiRepairDescription {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionApiRepair',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      if (
        !input.repair ||
        typeof input.repair !== 'object' ||
        Array.isArray(input.repair)
      )
        throw new Error('API materialRepair must contain source and request');
      for (const field of ['source', 'request'] as const)
        if (
          !input.repair[field] ||
          typeof input.repair[field] !== 'object' ||
          Array.isArray(input.repair[field])
        )
          throw new Error(`API materialRepair.${field} must be supplied`);
      const { source, request, pendingReplacement } = input.repair;
      const literalContext =
        input.repair.literalContext === undefined
          ? undefined
          : apiLiteralSourceContextSchema.parse(input.repair.literalContext);
      validateWorkflowConnectionSourceRepairRequest({ source, request });
      if (input.stage !== 'api-bindings' && input.stage !== 'api-arguments')
        throw new Error(
          'API repair stage must be api-bindings or api-arguments',
        );
      if (input.stage === 'api-bindings' && pendingReplacement !== undefined)
        throw new Error(
          'Pending binding work belongs to the API argument stage',
        );
      if (input.stage === 'api-bindings' && literalContext !== undefined)
        throw new Error(
          'literalContext belongs only to the API argument stage',
        );
      const work =
        pendingReplacement === undefined
          ? undefined
          : describeWorkflowConnectionMaterialRepairWork({
              source,
              request,
              replacement: pendingReplacement,
            });
      const effectiveRequest = work === undefined ? request : work.request;
      const target = effectiveRequest.request.targets.find(
        (item) =>
          item.stage === input.stage && item.nodeId === input.planning.callId,
      );
      if (!target)
        throw new Error(
          'API repair request does not authorize this planner target',
        );
      const description = describeConnectionSessionSource(source).source;
      const material = description.input.materials.find(
        (item) =>
          item.status === 'ready' && item.arguments.callId === target.nodeId,
      );
      if (!material || material.status !== 'ready')
        throw new Error(
          `API repair original material is absent: ${target.nodeId}`,
        );
      if (input.stage === 'api-bindings') {
        const expected = describeApiCallBindingPlanning({
          callId: target.nodeId,
          scenario: description.input.scenario,
          materials: description.input.materials.map((item) => ({
            callId:
              item.status === 'ready' ? item.arguments.callId : item.callId,
            operation: item.operation,
            ...(item.purpose === undefined ? {} : { purpose: item.purpose }),
            requestMediaType:
              item.status === 'ready'
                ? item.arguments.requestMediaType
                : item.requestMediaType,
          })),
          ...(input.planning.nativeOutputs === undefined &&
          description.sources.nativeOutputs.length === 0
            ? {}
            : { nativeOutputs: description.sources.nativeOutputs }),
          ...(input.planning.includeExplanations === undefined
            ? {}
            : { includeExplanations: input.planning.includeExplanations }),
        });
        if (
          !isDeepStrictEqual(
            describeApiCallBindingPlanning(input.planning).input,
            expected.input,
          )
        )
          throw new Error(
            'API binding repair input differs from its original source contracts or scenario',
          );
      } else {
        const task = work?.apiArgumentTasks.find(
          (item) => item.input.callId === target.nodeId,
        );
        if (work !== undefined && task === undefined)
          throw new Error(
            'API argument repair has no dependent literal task for this target',
          );
        const expected = describeApiLiteralGeneration({
          callId: target.nodeId,
          ...(literalContext === undefined
            ? { scenario: description.input.scenario }
            : literalContext),
          operation: material.operation,
          bindings:
            task === undefined
              ? material.arguments.bindings
              : task.input.bindings,
          ...(material.purpose === undefined
            ? {}
            : { purpose: material.purpose }),
          ...(material.arguments.requestMediaType === undefined
            ? {}
            : { requestMediaType: material.arguments.requestMediaType }),
          ...(input.planning.confirmedInputs === undefined
            ? {}
            : { confirmedInputs: input.planning.confirmedInputs }),
        });
        if (
          !isDeepStrictEqual(
            describeApiLiteralGeneration(input.planning).input,
            expected.input,
          )
        )
          throw new Error(
            'API argument repair input differs from its original source or validated binding work',
          );
      }
      return structuredClone({
        sourceFingerprint: request.sourceFingerprint,
        repairFingerprint: connectionValueFingerprint({
          request,
          ...(pendingReplacement === undefined ? {} : { pendingReplacement }),
          ...(literalContext === undefined ? {} : { literalContext }),
        }),
        target,
        reason: request.request.reason,
        requirements: source.requirements.filter((fact) =>
          request.request.factIds.includes(fact.id),
        ),
        ...(input.stage === 'api-bindings'
          ? { previousBindings: material.arguments.bindings }
          : {}),
      });
    },
  );
}
