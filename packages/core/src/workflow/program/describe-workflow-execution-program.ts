import type { WorkflowProgramSourceCapture } from '../../types/internal/workflow-execution-program.js';
import { preparedWorkflowProgramDescription } from './prepare-workflow-execution-program-source.js';
import { createResponseValueSchema } from '../../openapi/response/create-response-value-schema.js';
import type {
  WorkflowExecutionProgramSource,
  WorkflowExecutionProgramDescription,
} from '../../types/workflow-execution-program.js';
import { workflowProgramLimitsSchema } from '../../schemas/workflow-execution-program-schema.js';
import { describeConnectionSessionSource } from '../connections/incremental/describe-connection-session-source.js';
import { connectionValueFingerprint } from '../connections/incremental/connection-graph-identity.js';
import { describeConnectionMaterialRepairStages } from '../connections/materials/describe-connection-material-repair-stages.js';

/** One prepared inventory, without generating a second set of desired material values. */
export function describeWorkflowExecutionProgram(
  input: WorkflowExecutionProgramSource,
): WorkflowExecutionProgramDescription {
  const prepared = preparedWorkflowProgramDescription(input);
  if (prepared !== undefined) return prepared;
  return captureWorkflowExecutionProgramSource(input).description;
}

export function captureWorkflowExecutionProgramSource(
  input: WorkflowExecutionProgramSource,
): WorkflowProgramSourceCapture {
  const limits = workflowProgramLimitsSchema.parse(input.limits);
  for (const field of [
    'materials',
    'nativeNodes',
    'capabilities',
    'gaps',
    'requirements',
  ] as const)
    if (!Array.isArray(input[field]))
      throw new Error(
        `Execution program source.${field} must be an explicit array`,
      );
  if (
    input.controls !== undefined &&
    (input.controls === null ||
      typeof input.controls.version !== 'string' ||
      !input.controls.version.trim() ||
      typeof input.controls.create !== 'function' ||
      !Array.isArray(input.controls.capabilities))
  )
    throw new Error(
      'Execution program controls require version, capabilities and create',
    );
  const capabilities = [
    ...input.capabilities!,
    ...(input.controls?.capabilities ?? []),
  ];
  if (new Set(capabilities.map((c) => c.name)).size !== capabilities.length)
    throw new Error('Execution program capability names must be unique');
  const captured = describeConnectionSessionSource({ ...input, capabilities });
  const responseValues: WorkflowExecutionProgramDescription['responseValues'] =
    [];
  const referenceKeys = new Set<string>();
  for (const node of captured.source.context.nodes)
    for (const reference of node.references) {
      if (
        reference.source !== 'response' ||
        reference.pointer === '' ||
        referenceKeys.has(JSON.stringify(reference))
      )
        continue;
      referenceKeys.add(JSON.stringify(reference));
      const material = input.materials!.find(
        (material) =>
          (material.status === 'ready'
            ? material.arguments.callId
            : material.callId) === reference.nodeId,
      );
      if (material === undefined)
        throw new Error(
          'Execution program response reference has no supplied operation: ' +
            reference.nodeId,
        );
      const schema = createResponseValueSchema(
        material.operation,
        reference.pointer,
      );
      const group = responseValues.find(
        (group) => JSON.stringify(group.schema) === JSON.stringify(schema),
      );
      if (group === undefined)
        responseValues.push({ references: [reference], schema });
      else group.references.push(reference);
    }
  const description = {
    controlsAvailable: input.controls !== undefined,
    sourceFingerprint: connectionValueFingerprint({
      protocol: 'execution-program-v1',
      source: captured.fingerprint,
      limits,
      controlsVersion: input.controls?.version ?? null,
    }),
    context: captured.source.context,
    sources: captured.source.sources,
    requirements: structuredClone(input.requirements),
    apiOperations: captured.apiOperations.map((operation) => ({
      nodeId: operation.nodeId,
      method: operation.method,
      path: operation.path,
      ...(input.materials!.find(
        (m) =>
          (m.status === 'ready' ? m.arguments.callId : m.callId) ===
          operation.nodeId,
      )?.purpose === undefined
        ? {}
        : {
            purpose: input.materials!.find(
              (m) =>
                (m.status === 'ready' ? m.arguments.callId : m.callId) ===
                operation.nodeId,
            )!.purpose,
          }),
    })),
    limits,
    responseValues,
    materialRepairStages: describeConnectionMaterialRepairStages(
      captured.source.input,
    ),
  };
  return { description, connection: captured };
}
