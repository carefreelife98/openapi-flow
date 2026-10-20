import type { WorkflowNodeOutputReference } from '@openapi-flow/core';
import type {
  CompileNativeMaterialFragmentsInput,
  CompiledNativeMaterialFragments,
} from '../types/native-material-binding.js';
import type { N8nNodeFragment } from '../types/node-fragment.js';

/** Compile dependency names from actual SDK exits; graph execution order is still owned by explicit edges. */
export function compileNativeMaterialFragments(
  input: CompileNativeMaterialFragmentsInput,
): CompiledNativeMaterialFragments {
  const registry = new Map(
    input.materials.capabilities.map((capability) => [
      capability.name,
      capability,
    ]),
  );
  const selected = new Set(input.nodeIds);
  if (
    selected.size !== input.nodeIds.length ||
    input.nodeIds.some(
      (id) => !input.nativeNodes.some((node) => node.id === id),
    )
  )
    throw new Error(
      'Native compilation requires distinct actual selected nodeIds',
    );
  const pending = input.nativeNodes.filter((node) => selected.has(node.id));
  const sources = [...input.externalNativeOutputSources];
  const fragments = new Map<string, N8nNodeFragment>();
  const apiResponseContracts = Object.fromEntries(
    input.apiMaterials.map((material) => [material.callId, material.operation]),
  );
  let progressed = true;
  while (pending.length && progressed) {
    progressed = false;
    for (let index = 0; index < pending.length;) {
      const node = pending[index];
      const capability = registry.get(node.capability);
      if (!capability)
        throw new Error(`Missing current native compiler ${node.capability}`);
      const references: WorkflowNodeOutputReference[] = [
        ...(capability.nodeOutputReferences
          ? capability.nodeOutputReferences(node.parameters)
          : []),
        ...Object.values(
          capability.inputReferences
            ? capability.inputReferences(node.parameters)
            : {},
        )
          .flat()
          .filter((reference) => reference.source === 'node-output'),
      ];
      if (
        references.some(
          (reference) =>
            !sources.some((source) => source.nodeId === reference.nodeId),
        )
      ) {
        index++;
        continue;
      }
      const compiled = capability.compile({
        planned: node,
        apiNodeNames: input.apiNodeNames,
        apiResponseContracts,
        singletonApiResponseIds: input.singletonApiResponseIds,
        nativeOutputSources: sources,
        position: [
          600 +
            input.nativeNodes.findIndex((planned) => planned.id === node.id) *
              250,
          300,
        ],
      });
      if (
        compiled.nodeId !== node.id ||
        !compiled.exit.name.trim() ||
        JSON.stringify(Object.keys(compiled.inputPorts)) !==
          JSON.stringify(capability.inputPorts(node.parameters)) ||
        JSON.stringify(Object.keys(compiled.outputPorts)) !==
          JSON.stringify(capability.outputPorts(node.parameters))
      )
        throw new Error(
          `Native compiler ${node.capability} violated declared node identity/ports`,
        );
      if (
        compiled.rejoinsExclusiveOutputs !==
        capability.rejoinsExclusiveOutputs?.(node.parameters)
      )
        throw new Error(
          `Native compiler ${node.capability} violated declared rejoinsExclusiveOutputs`,
        );
      fragments.set(node.id, compiled);
      const output = input.materials.outputs.find(
        (output) => output.nodeId === node.id,
      );
      if (output) sources.push({ ...output, nodeName: compiled.exit.name });
      pending.splice(index, 1);
      progressed = true;
    }
  }
  if (pending.length)
    throw new Error(
      `Native compilation is missing actual producer exits for ${pending.map((node) => node.id).join(', ')}`,
    );
  return {
    fragments: input.nativeNodes
      .filter((node) => selected.has(node.id))
      .map((node) => fragments.get(node.id)!),
    outputSources: sources.filter((source) => selected.has(source.nodeId)),
  };
}
