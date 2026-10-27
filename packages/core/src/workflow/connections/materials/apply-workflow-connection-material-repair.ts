import { isDeepStrictEqual } from 'node:util';
import type {
  ApplyWorkflowConnectionMaterialRepairInput,
  WorkflowConnectionMaterialRepairResult,
  ReplayWorkflowConnectionMaterialRepairInput,
  ApplyWorkflowConnectionMaterialRepairWorkInput,
} from '../../../types/workflow-connection-material-repair.js';
import type { WorkflowConnectionSessionSource } from '../../../types/workflow-connection-session.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import {
  workflowConnectionSourceRepairReceiptSchema,
  workflowConnectionMaterialReplacementSchema,
} from '../../../schemas/workflow-connection-material-repair-schema.js';
import { createComparableConnectionArgumentValues } from './create-comparable-connection-argument-values.js';
import { prepareConnectionMaterialReplacement } from './prepare-connection-material-replacement.js';
import { describeWorkflowConnectionMaterialRepairWork } from './describe-workflow-connection-material-repair-work.js';
import { nativeParameterProducerIds } from '../../planning/native-parameter-producer-ids.js';
export { validateWorkflowConnectionSourceRepairRequest } from './prepare-connection-material-replacement.js';

/** Replace only explicitly requested execution material. OAS, roles, requirements, registry and baseline edges remain original. */
export function applyWorkflowConnectionMaterialRepair(
  input: ApplyWorkflowConnectionMaterialRepairInput,
): WorkflowConnectionMaterialRepairResult {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'applyWorkflowConnectionMaterialRepair',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      const { source, snapshot, request, replacement, beforeFingerprint } =
        prepareConnectionMaterialReplacement(input);
      const apis = new Map(
        replacement.apiArguments.map((args) => [args.callId, args]),
      );
      const natives = new Map(
        replacement.nativeNodes.map((node) => [node.id, node]),
      );
      const after = describeConnectionSessionSource(source);
      const before = describeConnectionSessionSource(snapshot);
      for (const target of request.request.targets) {
        if (
          target.stage !== 'native-parameters' ||
          request.request.targets.some(
            (item) =>
              item.nodeId === target.nodeId &&
              item.stage === 'native-dependencies',
          )
        )
          continue;
        const original = before.source.context.nodes.find(
          (node) => node.id === target.nodeId,
        )!;
        const changed = after.source.context.nodes.find(
          (node) => node.id === target.nodeId,
        )!;
        if (
          !isDeepStrictEqual(
            nativeParameterProducerIds(original),
            nativeParameterProducerIds(changed),
          )
        )
          throw new Error(
            `native-parameters repair cannot change producers without native-dependencies: ${target.nodeId}`,
          );
      }
      const changedApi = snapshot.materials?.some(
        (material) =>
          material.status === 'ready' &&
          apis.has(material.arguments.callId) &&
          !isDeepStrictEqual(
            createComparableConnectionArgumentValues(material.arguments),
            createComparableConnectionArgumentValues(
              apis.get(material.arguments.callId)!,
            ),
          ),
      );
      const changedNative = snapshot.nativeNodes?.some(
        (node) =>
          natives.has(node.id) &&
          !isDeepStrictEqual(node, natives.get(node.id)),
      );
      if (
        (!changedApi && !changedNative) ||
        beforeFingerprint === after.fingerprint
      )
        throw new Error('Material repair makes no execution-material progress');
      return {
        source,
        receipt: {
          request,
          replacement: structuredClone(replacement),
          afterSourceFingerprint: after.fingerprint,
        },
      };
    },
  );
}

/** Apply actual dependent argument results only after rederiving their work from the original binding result. */
export function applyWorkflowConnectionMaterialRepairWork(
  input: ApplyWorkflowConnectionMaterialRepairWorkInput,
): WorkflowConnectionMaterialRepairResult {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'applyWorkflowConnectionMaterialRepairWork',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      if (!input.work || !input.work.originalRequest)
        throw new Error('materialRepairWork.work.originalRequest is required');
      if (!input.pendingReplacement)
        throw new Error('materialRepairWork.pendingReplacement is required');
      const work = describeWorkflowConnectionMaterialRepairWork({
        source: input.source,
        request: input.work.originalRequest,
        replacement: input.pendingReplacement,
      });
      if (!isDeepStrictEqual(input.work, work))
        throw new Error(
          'Dependent API argument work differs from its original request, binding result or OAS',
        );
      const final = workflowConnectionMaterialReplacementSchema.parse(
        input.replacement,
      );
      if (!isDeepStrictEqual(final, input.replacement))
        throw new Error(
          'Dependent API argument results must not be normalized',
        );
      const tasks = new Set(
        work.apiArgumentTasks.map((task) => task.input.callId),
      );
      const pending = new Map(
        input.pendingReplacement.apiArguments.map((args) => [
          args.callId,
          args,
        ]),
      );
      if (
        !isDeepStrictEqual(
          final.nativeNodes,
          input.pendingReplacement.nativeNodes,
        )
      )
        throw new Error(
          'Dependent API argument work cannot change the pending native result',
        );
      for (const args of final.apiArguments) {
        const original = pending.get(args.callId);
        if (
          !original ||
          !isDeepStrictEqual(args.bindings, original.bindings) ||
          args.requestMediaType !== original.requestMediaType
        )
          throw new Error(
            `Dependent API argument work cannot change its pending bindings or media type: ${args.callId}`,
          );
        if (!tasks.has(args.callId) && !isDeepStrictEqual(args, original))
          throw new Error(
            `Dependent API argument work cannot change an unassigned result: ${args.callId}`,
          );
      }
      const result = applyWorkflowConnectionMaterialRepair({
        source: input.source,
        request: work.request,
        replacement: input.replacement,
      });
      return {
        source: result.source,
        receipt: {
          ...result.receipt,
          workSource: {
            request: structuredClone(work.originalRequest),
            replacement: structuredClone(input.pendingReplacement),
          },
        },
      };
    },
  );
}

/** Replay every saved repair from the immutable base rather than trusting a stored checked flag. */
export function replayWorkflowConnectionMaterialRepair(
  input: ReplayWorkflowConnectionMaterialRepairInput,
): WorkflowConnectionSessionSource {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'replayWorkflowConnectionMaterialRepair',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      const receipt = workflowConnectionSourceRepairReceiptSchema.parse(
        input.receipt,
      );
      const result =
        receipt.workSource === undefined
          ? applyWorkflowConnectionMaterialRepair({
              source: input.source,
              request: receipt.request,
              replacement: receipt.replacement,
            })
          : applyWorkflowConnectionMaterialRepairWork({
              source: input.source,
              work: describeWorkflowConnectionMaterialRepairWork({
                source: input.source,
                request: receipt.workSource.request,
                replacement: receipt.workSource.replacement,
              }),
              pendingReplacement: receipt.workSource.replacement,
              replacement: receipt.replacement,
            });
      if (!isDeepStrictEqual(result.receipt, receipt))
        throw new Error(
          'Material repair receipt differs from its original source and actual replacement',
        );
      return result.source;
    },
  );
}
