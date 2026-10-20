import { isDeepStrictEqual } from 'node:util';
import type {
  CreateNativeNodePlanningRecordInput,
  NativeNodePlanningRecord,
  NativePlanningRecordFields,
} from '../../types/native-node-planning.js';
import {
  nativePlanningResultSchema,
  nativePlanningAssessmentSchema,
  nativeNodePlanningRecordSchema,
} from '../../schemas/native-node-planning-record-schema.js';
import { describeNativeNodePlanning } from './describe-native-node-planning.js';
import { createNativeNodePlan } from './create-native-node-plan.js';
import { assembleNativeNodeMaterials } from './assemble-native-node-materials.js';
import { createWorkflowNodeContracts } from '../create-workflow-node-contracts.js';
import { resolveNativePlanningMaterials } from './resolve-native-planning-materials.js';

export function createNativeNodePlanningRecord(
  input: CreateNativeNodePlanningRecordInput,
): NativeNodePlanningRecord {
  const { input: snapshot, context } = describeNativeNodePlanning(input);
  const plan = nativePlanningResultSchema.parse({
    nativeNodes: input.plan.nativeNodes,
    gaps: input.plan.gaps,
  });
  const expected = createNativeNodePlan({
    ...snapshot,
    proposal: {
      nativeNodes: plan.nativeNodes,
      gaps: plan.gaps.map(({ description }) => ({ description })),
    },
  });
  if (!isDeepStrictEqual(plan, expected))
    throw new Error(
      'native planning result differs from its original proposal or code-derived gap identities',
    );
  const allNodes = assembleNativeNodeMaterials(
    snapshot.preparedNativeNodes,
    plan.nativeNodes,
  );
  const { capabilities, outputs } = resolveNativePlanningMaterials({
    nativeNodes: allNodes,
    capabilities: snapshot.capabilities,
    apiMaterials: snapshot.apiMaterials,
    nativeOutputs: [],
  });
  const fields: NativePlanningRecordFields = {
    planId: snapshot.planId,
    plan: structuredClone(plan),
    evidence: { kind: 'native-planning-context', context },
    verification: structuredClone({
      contracts: createWorkflowNodeContracts({
        materials: [],
        nativeNodes: allNodes,
        capabilities,
      }),
      outputs,
    }),
  };
  if (!snapshot.capabilities.length) {
    if (input.assessment !== undefined)
      throw new Error(
        'native planning without capabilities must not include a model assessment',
      );
    return nativeNodePlanningRecordSchema.parse({
      ...fields,
      kind: 'no-capabilities',
    });
  }
  const assessment = nativePlanningAssessmentSchema.parse(input.assessment);
  if (assessment.kind === 'no-additions') {
    if (plan.nativeNodes.length)
      throw new Error(
        'native no-additions assessment cannot contain new native nodes',
      );
  } else {
    const ids = new Set(assessment.nodes.map((node) => node.nodeId));
    if (
      !plan.nativeNodes.length ||
      ids.size !== assessment.nodes.length ||
      ids.size !== plan.nativeNodes.length ||
      plan.nativeNodes.some((node) => !ids.has(node.id))
    )
      throw new Error(
        'native planning reasons must name every new node ID exactly once',
      );
  }
  return nativeNodePlanningRecordSchema.parse({
    ...fields,
    kind: 'model-plan',
    assessment,
  });
}
