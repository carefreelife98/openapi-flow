import { isDeepStrictEqual } from 'node:util';
import type {
  WorkflowConnectionRevisionMaterialDescriptionInput,
  WorkflowConnectionRevisionMaterialChanges,
} from '../../../types/workflow-connection-revision.js';
import { createApiRequestSchema } from '../../../schemas/create-api-request-schema.js';
import { analyzeWorkflowConnectionRevisionImpact } from './analyze-workflow-connection-revision-impact.js';
import { selectWorkflowConnectionArgumentValues } from '../materials/select-workflow-connection-argument-values.js';

/** Only changed settings and their actual request/producer contracts; no runtime registries or audit prompts. */
export function describeWorkflowConnectionMaterialChanges(
  input: WorkflowConnectionRevisionMaterialDescriptionInput,
): WorkflowConnectionRevisionMaterialChanges {
  const affected = new Set(
    analyzeWorkflowConnectionRevisionImpact({
      before: input.before,
      after: input.after,
      previousSession: input.session,
      goals: input.session.goals,
      graph: input.session,
    }).affectedNodeIds,
  );
  const beforeApis = new Map(
    input.before.source.input.materials.flatMap((material) =>
      material.status === 'ready'
        ? [[material.arguments.callId, material] as const]
        : [],
    ),
  );
  const afterApis = new Map(
    input.after.source.input.materials.flatMap((material) =>
      material.status === 'ready'
        ? [[material.arguments.callId, material] as const]
        : [],
    ),
  );
  const referenced = new Set<string>();
  const apiCalls = [...afterApis].flatMap(([callId, material]) => {
    const original = beforeApis.get(callId);
    if (!original)
      throw new Error(`Original API material is missing: ${callId}`);
    const before = selectWorkflowConnectionArgumentValues(original.arguments),
      after = selectWorkflowConnectionArgumentValues(material.arguments);
    const argumentsChanged = !isDeepStrictEqual(before, after);
    if (!argumentsChanged && !affected.has(callId)) return [];
    for (const binding of [...before.bindings, ...after.bindings])
      referenced.add(binding.sourceNodeId);
    return [
      {
        callId,
        argumentsChanged,
        before,
        after,
        beforeRequestSchema: createApiRequestSchema({
          operation: original.operation,
          requestMediaType: before.requestMediaType,
        }),
        afterRequestSchema: createApiRequestSchema({
          operation: material.operation,
          requestMediaType: after.requestMediaType,
        }),
      },
    ];
  });
  const beforeNatives = new Map(
    input.before.source.input.nativeNodes.map((node) => [node.id, node]),
  );
  const afterNatives = new Map(
    input.after.source.input.nativeNodes.map((node) => [node.id, node]),
  );
  const beforeOutputs = new Map(
    input.before.source.sources.nativeOutputs.map((output) => [
      output.nodeId,
      output,
    ]),
  );
  const afterOutputs = new Map(
    input.after.source.sources.nativeOutputs.map((output) => [
      output.nodeId,
      output,
    ]),
  );
  const beforeDefinitions = new Map(
    input.before.source.sources.capabilities.map((definition) => [
      definition.name,
      definition,
    ]),
  );
  const afterDefinitions = new Map(
    input.after.source.sources.capabilities.map((definition) => [
      definition.name,
      definition,
    ]),
  );
  const relevantNatives = new Set(
    [...new Set([...beforeNatives.keys(), ...afterNatives.keys()])].filter(
      (nodeId) => {
        const before = beforeNatives.get(nodeId),
          after = afterNatives.get(nodeId);
        return (
          !isDeepStrictEqual(before, after) ||
          !isDeepStrictEqual(
            beforeOutputs.get(nodeId),
            afterOutputs.get(nodeId),
          ) ||
          referenced.has(nodeId) ||
          !isDeepStrictEqual(
            before === undefined
              ? undefined
              : beforeDefinitions.get(before.capability),
            after === undefined
              ? undefined
              : afterDefinitions.get(after.capability),
          )
        );
      },
    ),
  );
  let expanded: boolean;
  do {
    expanded = false;
    for (const node of [
      ...input.before.source.context.nodes,
      ...input.after.source.context.nodes,
    ])
      if (relevantNatives.has(node.id)) {
        for (const reference of [
          ...node.references,
          ...Object.values(node.inputReferences ?? {}).flat(),
        ]) {
          referenced.add(reference.nodeId);
          if (
            (beforeNatives.has(reference.nodeId) ||
              afterNatives.has(reference.nodeId)) &&
            !relevantNatives.has(reference.nodeId)
          ) {
            relevantNatives.add(reference.nodeId);
            expanded = true;
          }
        }
      }
  } while (expanded);
  const nativeNodes = [...relevantNatives].map((nodeId) => {
    const before = beforeNatives.get(nodeId),
      after = afterNatives.get(nodeId);
    const beforeOutput = beforeOutputs.get(nodeId),
      afterOutput = afterOutputs.get(nodeId);
    const beforeDefinition =
      before === undefined
        ? undefined
        : beforeDefinitions.get(before.capability);
    const afterDefinition =
      after === undefined ? undefined : afterDefinitions.get(after.capability);
    return {
      nodeId,
      before: before === undefined ? null : structuredClone(before),
      after: after === undefined ? null : structuredClone(after),
      beforeOutput:
        beforeOutput === undefined ? null : structuredClone(beforeOutput),
      afterOutput:
        afterOutput === undefined ? null : structuredClone(afterOutput),
      beforeDefinition:
        beforeDefinition === undefined
          ? null
          : structuredClone(beforeDefinition),
      afterDefinition:
        afterDefinition === undefined ? null : structuredClone(afterDefinition),
    };
  });
  const apiResponseContracts = [...new Map([...beforeApis, ...afterApis])]
    .filter(([id]) => referenced.has(id))
    .map(([nodeId, material]) =>
      structuredClone({
        nodeId,
        key: material.operation.key,
        method: material.operation.method,
        path: material.operation.path,
        responses: material.operation.operation.responses,
      }),
    );
  return { apiCalls, nativeNodes, apiResponseContracts };
}
