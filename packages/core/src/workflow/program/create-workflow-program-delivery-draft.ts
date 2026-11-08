import { isDeepStrictEqual } from 'node:util';
import type {
  CreateWorkflowProgramDeliveryDraftInput,
  WorkflowProgramDeliveryDraft,
} from '../../types/workflow-execution-program.js';
import type { ApiOperationContract } from '../../types/api-operation.js';
import { apiOperationKeyEquals } from '../../openapi/catalog/api-operation-key-equals.js';
import { createWorkflowDraft } from '../../draft/create-workflow-draft.js';
import { validateWorkflowExecutionProgram } from './resolve-workflow-execution-program.js';
import { inspectWorkflowProgramDelivery } from './inspect-workflow-program-delivery.js';
/** Delivery is an execution projection, not a claim that an unfinished whole-workflow requirement was fulfilled. */
export function createWorkflowProgramDeliveryDraft(
  input: CreateWorkflowProgramDeliveryDraftInput,
): WorkflowProgramDeliveryDraft {
  const checked = validateWorkflowExecutionProgram(input);
  const inspection =
    input.blockedNodeIds === undefined
      ? checked
      : inspectWorkflowProgramDelivery({
          ...input,
          blockedNodeIds: input.blockedNodeIds,
        });
  if ('status' in inspection && inspection.status === 'unavailable')
    return { status: 'unavailable', inspection };
  if (input.literalSourceMessages === undefined)
    throw new Error(
      'Program delivery requires original source.literalSourceMessages',
    );
  const materials =
    'materials' in inspection ? inspection.materials : input.materials!;
  const operations: ApiOperationContract[] = [];
  for (const material of materials) {
    const original = operations.find((operation) =>
      apiOperationKeyEquals(operation.key, material.operation.key),
    );
    if (original === undefined) operations.push(material.operation);
    else if (!isDeepStrictEqual(original, material.operation))
      throw new Error(
        'Program delivery has conflicting original contracts for operation ' +
          material.operation.key.operationRef,
      );
  }
  const context = {
    messages: input.literalSourceMessages,
    operations,
    capabilities: [
      ...input.capabilities!,
      ...(input.controls?.capabilities ?? []),
    ],
    entrypoint: input.entrypoint,
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: input.id,
      requirements: [],
      apiCalls: materials.map((material) => {
        if (material.status !== 'ready')
          throw new Error(
            'Program delivery contains an unprepared API: ' + material.callId,
          );
        const args = material.arguments;
        return {
          id: args.callId,
          operation: material.operation.key,
          values: args.values,
          bindings: args.bindings,
          ...(args.requestMediaType === undefined
            ? {}
            : { requestMediaType: args.requestMediaType }),
          ...(args.requestedInputs === undefined
            ? {}
            : { requestedInputs: args.requestedInputs }),
        };
      }),
      nativeNodes: inspection.plan.nativeNodes,
      gapNodes: [],
      edges: inspection.plan.edges,
    },
  });
  return { status: 'ready', inspection, draft, context };
}
