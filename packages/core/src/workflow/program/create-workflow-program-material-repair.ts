import { preparedWorkflowProgramMaterialSource } from './prepare-workflow-execution-program-source.js';
import type { WorkflowConnectionSessionSource } from '../../types/workflow-connection-session.js';
import type {
  CreateWorkflowProgramMaterialRepairInput,
  WorkflowProgramMaterialRepair,
} from '../../types/workflow-execution-program.js';
import { describeWorkflowExecutionProgram } from './describe-workflow-execution-program.js';
import { describeConnectionSessionSource } from '../connections/incremental/describe-connection-session-source.js';
import { validateWorkflowConnectionSourceRepairRequest } from '../connections/materials/prepare-connection-material-replacement.js';

/** Request the actual material owner without constructing model-generated connection goals. */
export function createWorkflowProgramMaterialRepair(
  input: CreateWorkflowProgramMaterialRepairInput,
): WorkflowProgramMaterialRepair {
  const current = describeWorkflowExecutionProgram(input);
  if (current.sourceFingerprint !== input.expectedSourceFingerprint)
    throw new Error(
      'Execution program material repair belongs to a stale source',
    );
  for (const target of input.decision.targets)
    if (
      !current.materialRepairStages.some(
        (stage) =>
          stage.stage === target.stage && stage.nodeIds.includes(target.nodeId),
      )
    )
      throw new Error(
        `Execution program material target is not eligible: ${target.stage}: ${target.nodeId}`,
      );
  const prepared = preparedWorkflowProgramMaterialSource(input);
  const captured =
    prepared === undefined
      ? describeConnectionSessionSource({
          ...input,
          capabilities: [
            ...input.capabilities!,
            ...(input.controls?.capabilities ?? []),
          ],
        }).source.input
      : undefined;
  const source: WorkflowConnectionSessionSource = prepared ?? {
    scenario: captured!.scenario,
    materials: captured!.materials,
    nativeNodes: captured!.nativeNodes,
    capabilities: captured!.capabilities,
    gaps: captured!.gaps,
    edges: captured!.edges,
    requirements: structuredClone(input.requirements),
    ...(captured!.entrypoint === undefined
      ? {}
      : { entrypoint: captured!.entrypoint }),
    ...(input.reviewBoundary === undefined
      ? {}
      : { reviewBoundary: input.reviewBoundary }),
    ...(input.literalSourceMessages === undefined
      ? {}
      : {
          literalSourceMessages: structuredClone(input.literalSourceMessages),
        }),
    ...(input.editableEdgeIds === undefined
      ? {}
      : { editableEdgeIds: structuredClone(input.editableEdgeIds) }),
    ...(input.deferredApiInputIds === undefined
      ? {}
      : { deferredApiInputIds: structuredClone(input.deferredApiInputIds) }),
  };
  const request = {
    kind: 'replan-materials' as const,
    sourceFingerprint: describeConnectionSessionSource(source).fingerprint,
    request: structuredClone(input.decision),
  };
  validateWorkflowConnectionSourceRepairRequest({ source, request });
  return { source, sourceFingerprint: current.sourceFingerprint, request };
}
