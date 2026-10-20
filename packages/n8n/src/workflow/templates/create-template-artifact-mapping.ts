import type {
  CreateTemplateArtifactMappingInput,
  TemplateArtifactMapping,
  N8nTemplateNodeMapping,
} from '../../types/workflow-template.js';
import { inspectWorkflowDraftCapabilityGap } from '@openapi-flow/core';
import {
  TEMPLATE_INPUT_ID,
  TEMPLATE_INPUT_NAME,
} from './workflow-template-identities.js';

export function createTemplateArtifactMapping(
  input: CreateTemplateArtifactMappingInput,
): TemplateArtifactMapping {
  const mappings: N8nTemplateNodeMapping[] = input.fragments.map((fragment) => {
    const common = {
      nodeId: fragment.nodeId,
      sdkNodeIds: fragment.nodes.map((node) => node.id),
      entryNodeName: fragment.entry.name,
      exitNodeName: fragment.exit.name,
    };
    const material = input.materials.find(
      (item) => item.arguments.callId === fragment.nodeId,
    );
    if (material) {
      const { key, method, path } = material.operation;
      const { summary } = material.operation.operation;
      return {
        ...common,
        kind: 'api',
        operation: {
          key,
          method,
          path,
          ...(summary !== undefined ? { summary } : {}),
        },
      };
    }
    const gap = input.draft.gapNodes?.find(
      (node) => node.id === fragment.nodeId,
    );
    if (gap)
      return {
        ...common,
        kind: 'capability-gap',
        gap: structuredClone(gap),
        inventoryCurrent: inspectWorkflowDraftCapabilityGap({
          gap,
          context: input.context,
        }).inventoryCurrent,
      };
    const planned = input.draft.nativeNodes.find(
      (node) => node.id === fragment.nodeId,
    );
    if (!planned)
      throw new Error(
        `Template fragment ${fragment.nodeId} has no original API or native instance`,
      );
    return { ...common, kind: 'native', capability: planned.capability };
  });
  const inputSlots = input.slots.map((slot) => {
    const mapping = mappings.find(
      (mapping) =>
        mapping.kind ===
          (slot.kind === 'api-request-input' ? 'api' : 'native') &&
        mapping.nodeId ===
          (slot.kind === 'api-request-input' ? slot.callId : slot.nodeId),
    );
    if (!mapping)
      throw new Error(
        `Template slot ${slot.id} has no compiled source node mapping`,
      );
    return {
      ...slot,
      editNodeId: TEMPLATE_INPUT_ID,
      editNodeName: TEMPLATE_INPUT_NAME,
      editParameter: 'jsCode' as const,
      materializerNodeName: mapping.entryNodeName,
    };
  });
  return { mappings, inputSlots };
}
