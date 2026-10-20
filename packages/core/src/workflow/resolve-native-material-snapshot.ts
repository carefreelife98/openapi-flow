import { isDeepStrictEqual } from 'node:util';
import type {
  ResolveNativeMaterialSnapshotInput,
  NativeMaterialSnapshot,
  BoundNativeMaterialNode,
  PendingNativeMaterialNode,
  WorkflowNativeMaterialSources,
} from '../types/native-material-snapshot.js';
import type {
  WorkflowCapability,
  WorkflowValueReference,
} from '../types/workflow-plan.js';
import type { WorkflowNativeParameterReference } from '../types/native-parameter-reference.js';
import type { NativeOutputContract } from '../types/node-output.js';
import { inspectNativeReferenceStructure } from './inspect-native-reference-structure.js';
import { createWorkflowNodeContracts } from './create-workflow-node-contracts.js';
import { createNativeOutputContracts } from './create-native-output-contracts.js';
import { validateNativeOutputContracts } from '../bindings/validate-native-output-contracts.js';
import { validateNativeMaterialSources } from './validate-native-material-sources.js';
import { describeNativeReferenceBindings } from './describe-native-reference-bindings.js';
import { bindNativeMaterialContracts } from './bind-native-material-contracts.js';

/** Resolve actual source contracts in dependency order; unresolved output is never replaced by an old schema. */
export function resolveNativeMaterialSnapshot(
  input: ResolveNativeMaterialSnapshotInput,
): NativeMaterialSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Native material snapshot input must be an object');
  for (const field of [
    'apiMaterials',
    'nativeOutputs',
    'nativeNodes',
    'capabilities',
    'deferredNodeIds',
  ] as const)
    if (!Array.isArray(input[field]))
      throw new Error(
        `Native material snapshot.${field} must be an explicit array`,
      );
  if (
    input.shouldDeferNode !== undefined &&
    typeof input.shouldDeferNode !== 'function'
  )
    throw new Error(
      'Native material snapshot.shouldDeferNode must be a function',
    );
  if (
    input.capabilities.some(
      (capability) =>
        typeof capability?.name !== 'string' || !capability.name.trim(),
    )
  )
    throw new Error(
      'Native material snapshot.capabilities must have non-empty names',
    );
  const registry = new Map(
    input.capabilities.map((capability) => [capability.name, capability]),
  );
  const ids = [
    ...input.apiMaterials.map((source) => source.callId),
    ...input.nativeNodes.map((node) => node.id),
  ];
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string' || !id.trim()) ||
    registry.size !== input.capabilities.length
  )
    throw new Error(
      'Native material snapshot requires unique actual node IDs and capability names',
    );
  if (
    new Set(input.deferredNodeIds).size !== input.deferredNodeIds.length ||
    input.deferredNodeIds.some(
      (id) => !input.nativeNodes.some((node) => node.id === id),
    )
  )
    throw new Error(
      'Native material snapshot deferredNodeIds must name distinct actual native nodes',
    );
  validateNativeOutputContracts(input.nativeOutputs);
  if (input.nativeOutputs.some((output) => ids.includes(output.nodeId)))
    throw new Error(
      'Native material snapshot external outputs cannot replace a current workflow node',
    );
  const references = new Map<string, WorkflowNativeParameterReference[]>();
  for (const node of input.nativeNodes) {
    const capability = registry.get(node.capability);
    if (!capability)
      throw new Error(
        `Native material snapshot node ${node.id}: unknown capability ${node.capability}`,
      );
    if (
      capability.bindMaterialContracts &&
      (!capability.referenceStructureSchema ||
        !capability.parameterReferenceBindings)
    )
      throw new Error(
        `Native capability ${capability.name} requires explicit reference structure for material binding`,
      );
    if (capability.referenceStructureSchema)
      references.set(
        node.id,
        inspectNativeReferenceStructure({ node, capability }).map(
          (binding) => binding.reference,
        ),
      );
    else {
      const [contract] = createWorkflowNodeContracts({
        materials: [],
        nativeNodes: [node],
        capabilities: [capability],
      });
      references.set(node.id, [
        ...contract.references,
        ...Object.values(
          contract.inputReferences === undefined
            ? {}
            : contract.inputReferences,
        ).flat(),
        ...(contract.rejoinsExclusiveOutputs === undefined
          ? []
          : [
              {
                source: 'exclusive-output' as const,
                nodeId: contract.rejoinsExclusiveOutputs,
              },
            ]),
      ]);
    }
  }
  const remaining = [...input.nativeNodes];
  for (const [nodeId, declared] of references)
    for (const reference of declared) {
      if (
        reference.source !== 'response' &&
        input.apiMaterials.some((source) => source.callId === reference.nodeId)
      )
        throw new Error(
          `node ${nodeId}: expected declared native node ${reference.nodeId} for ${reference.source}; supplied source is an API`,
        );
      if (
        reference.source === 'response' &&
        (input.nativeNodes.some((node) => node.id === reference.nodeId) ||
          input.nativeOutputs.some(
            (output) => output.nodeId === reference.nodeId,
          ))
      )
        throw new Error(
          `node ${nodeId}: expected supplied API callId ${reference.nodeId}, not a native source`,
        );
    }
  const outputs: NativeOutputContract[] = [];
  const bindings: BoundNativeMaterialNode[] = [];
  const pending: PendingNativeMaterialNode[] = [];
  const sources = (): WorkflowNativeMaterialSources => ({
    apiMaterials: structuredClone(input.apiMaterials),
    nativeOutputs: structuredClone([...input.nativeOutputs, ...outputs]),
  });
  function bind(definition: WorkflowCapability): WorkflowCapability {
    return bindNativeMaterialContracts(definition, sources());
  }
  let progressed = true;
  while (remaining.length && progressed) {
    progressed = false;
    for (let index = 0; index < remaining.length;) {
      const node = remaining[index];
      if (
        input.deferredNodeIds.includes(node.id) ||
        input.shouldDeferNode?.(
          node.id,
          structuredClone(outputs),
          bindings.map((binding) => binding.nodeId),
        ) === true
      ) {
        pending.push({
          nodeId: node.id,
          capability: node.capability,
          kind: 'deferred-reference',
          sourceNodeIds: [
            ...new Set(
              references.get(node.id)!.map((reference) => reference.nodeId),
            ),
          ],
        });
        remaining.splice(index, 1);
        progressed = true;
        continue;
      }
      const unresolved = references
        .get(node.id)!
        .filter((reference) =>
          reference.source === 'response'
            ? !input.apiMaterials.some(
                (source) => source.callId === reference.nodeId,
              )
            : reference.source === 'exclusive-output'
              ? !bindings.some((bound) => bound.nodeId === reference.nodeId)
              : ![...input.nativeOutputs, ...outputs].some(
                  (output) => output.nodeId === reference.nodeId,
                ),
        );
      if (unresolved.length) {
        index++;
        continue;
      }
      const capability = bind(registry.get(node.capability)!);
      if (capability.parameterReferenceBindings)
        describeNativeReferenceBindings({ node, capability });
      const [contract] = createWorkflowNodeContracts({
        materials: [],
        nativeNodes: [node],
        capabilities: [capability],
      });
      const actualReferences: WorkflowValueReference[] = [
        ...contract.references,
        ...Object.values(
          contract.inputReferences === undefined
            ? {}
            : contract.inputReferences,
        ).flat(),
      ];
      validateNativeMaterialSources(capability, actualReferences, sources());
      outputs.push(
        ...createNativeOutputContracts({
          nativeNodes: [node],
          capabilities: [capability],
        }),
      );
      bindings.push({ nodeId: node.id, capability });
      remaining.splice(index, 1);
      progressed = true;
    }
  }
  for (const node of remaining)
    pending.push({
      nodeId: node.id,
      capability: node.capability,
      kind: 'unavailable-source',
      sourceNodeIds: [
        ...new Set(
          references
            .get(node.id)!
            .filter((reference) =>
              reference.source === 'response'
                ? !input.apiMaterials.some(
                    (source) => source.callId === reference.nodeId,
                  )
                : reference.source === 'exclusive-output'
                  ? !bindings.some((bound) => bound.nodeId === reference.nodeId)
                  : ![...input.nativeOutputs, ...outputs].some(
                      (output) => output.nodeId === reference.nodeId,
                    ),
            )
            .map((reference) => reference.nodeId),
        ),
      ],
    });
  if (pending.length) return { status: 'pending', bindings, outputs, pending };
  const capabilities = [
    ...new Set(input.nativeNodes.map((node) => node.capability)),
  ].map((name) => bind(registry.get(name)!));
  const completedContracts = createWorkflowNodeContracts({
    materials: [],
    nativeNodes: input.nativeNodes,
    capabilities,
  });
  for (const node of input.nativeNodes) {
    const capability = capabilities.find(
      (candidate) => candidate.name === node.capability,
    )!;
    const contract = completedContracts.find(
      (candidate) => candidate.id === node.id,
    )!;
    validateNativeMaterialSources(
      capability,
      [
        ...contract.references,
        ...Object.values(
          contract.inputReferences === undefined
            ? {}
            : contract.inputReferences,
        ).flat(),
      ],
      sources(),
    );
  }
  const completed = createNativeOutputContracts({
    nativeNodes: input.nativeNodes,
    capabilities,
  });
  for (const output of outputs)
    if (
      !isDeepStrictEqual(
        output,
        completed.find((item) => item.nodeId === output.nodeId),
      )
    )
      throw new Error(
        `Native material binding ${output.nodeId} changes its output when unrelated contracts become available`,
      );
  return {
    status: 'ready',
    bindings,
    outputs: completed,
    pending,
    capabilities,
  };
}
