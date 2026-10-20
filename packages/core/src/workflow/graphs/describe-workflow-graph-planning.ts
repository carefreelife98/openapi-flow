import type {
  WorkflowGraphPlanningInput,
  WorkflowGraphPlanningDescription,
} from '../../types/workflow-graph-planning.js';
import { workflowGraphPlanningIdentitySchema } from '../../schemas/workflow-graph-planning-schema.js';
import { workflowReviewGapSchema } from '../../schemas/workflow-planning-material-schema.js';
import { captureWorkflowPlanningData } from '../planning/capture-workflow-planning-data.js';
import { createPreparedNativeNodeMaterials } from '../planning/create-prepared-native-node-materials.js';
import { createNativePlanningCapabilityMaterial } from '../planning/create-native-planning-capability-material.js';
import { createNativeOutputContracts } from '../create-native-output-contracts.js';
import { createWorkflowPlanningCapabilities } from '../create-workflow-planning-capabilities.js';
import { inspectApiArgumentRequirements } from '../../arguments/clarification/inspect-api-argument-requirements.js';

export function describeWorkflowGraphPlanning(
  input: WorkflowGraphPlanningInput,
): WorkflowGraphPlanningDescription {
  const identity = workflowGraphPlanningIdentitySchema.parse({
    mode: input.mode,
    scenario: input.scenario,
  });
  if (!Array.isArray(input.capabilities))
    throw new Error('graph planning capabilities must be an array');
  if (!Array.isArray(input.gaps))
    throw new Error('graph planning gaps must be an array');
  const captured = captureWorkflowPlanningData(input);
  const gaps = structuredClone(
    input.gaps.map((gap) => workflowReviewGapSchema.parse(gap)),
  );
  if (
    identity.mode === 'executable' &&
    (gaps.length ||
      captured.materials.some((material) => material.status !== 'ready'))
  )
    throw new Error(
      'executable graph planning accepts only ready API materials and no supplied review gaps',
    );
  for (const material of captured.materials) {
    if (material.status !== 'ready') continue;
    const args = material.arguments;
    if (
      args.unresolvedInputs.length ||
      inspectApiArgumentRequirements({ operation: material.operation, ...args })
        .status !== 'ready'
    )
      throw new Error(
        `graph planning materials[${args.callId}] has unresolved OAS request inputs or scenario-requested inputs`,
      );
  }
  const apiIds = captured.materials.map((material) =>
    material.status === 'ready' ? material.arguments.callId : material.callId,
  );
  const planningCapabilities = createWorkflowPlanningCapabilities({
    capabilities: captured.capabilities,
    apiCallIds: apiIds,
  });
  const nativeOutputs = createNativeOutputContracts({
    nativeNodes: captured.preparedNativeNodes,
    capabilities: captured.capabilities,
  });
  return {
    input: { ...identity, ...captured, gaps },
    planningCapabilities,
    context: {
      scenario: identity.scenario,
      preparedNativeNodes: structuredClone(
        createPreparedNativeNodeMaterials(
          captured.preparedNativeNodes,
          captured.capabilities,
        ),
      ),
      nativeOutputs: structuredClone(nativeOutputs),
      // Request values are already generated. Avoid duplicating the resolved
      // response schemas through both operation and pathItem in this stage.
      materials: captured.materials.map(({ operation, ...material }) => ({
        ...structuredClone(material),
        operation: structuredClone({
          key: operation.key,
          method: operation.method,
          path: operation.path,
          operation: {
            ...(operation.operation.summary === undefined
              ? {}
              : { summary: operation.operation.summary }),
            ...(operation.operation.description === undefined
              ? {}
              : { description: operation.operation.description }),
            ...(operation.operation.tags === undefined
              ? {}
              : { tags: operation.operation.tags }),
            ...(operation.operation.responses === undefined
              ? {}
              : { responses: operation.operation.responses }),
          },
        }),
        inputPorts: ['main'],
        outputPorts: ['main'],
      })),
      ...(identity.mode === 'reviewable'
        ? {
            gaps: gaps.map((gap) => ({
              ...structuredClone(gap),
              inputPorts: ['main'],
              outputPorts: ['main'],
            })),
          }
        : {}),
      capabilities: planningCapabilities.map((capability) => {
        const material = createNativePlanningCapabilityMaterial(
          capability,
          false,
        );
        return {
          name: material.name,
          description: material.description,
          parametersSchema: material.parametersSchema,
          waitsForAllInputs: capability.waitsForAllInputs,
          exclusiveOutputPorts: capability.exclusiveOutputPorts,
        };
      }),
    },
    sources: structuredClone({
      materials: captured.materials,
      nativeOutputs,
      capabilities: captured.capabilities.map((capability) =>
        createNativePlanningCapabilityMaterial(capability, false),
      ),
    }),
  };
}
