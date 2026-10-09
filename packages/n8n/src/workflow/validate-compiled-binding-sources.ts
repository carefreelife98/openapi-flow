import { isDeepStrictEqual } from 'node:util';
import type {
  NativeOutputContract,
  WorkflowApiMaterial,
} from '@openapi-flow/core';
import type { N8nNodeFragment } from '../types/node-fragment.js';

/** The runtime reader must use the same producer/root/schema the plan validated. */
export function validateCompiledBindingSources(
  apiNodes: N8nNodeFragment[],
  nativeNodes: N8nNodeFragment[],
  contracts: NativeOutputContract[],
  materials: WorkflowApiMaterial[],
): void {
  const apis = new Map(apiNodes.map((fragment) => [fragment.nodeId, fragment]));
  const natives = new Map(
    nativeNodes.map((fragment) => [fragment.nodeId, fragment]),
  );
  const outputs = new Map(
    contracts.map((contract) => [contract.nodeId, contract]),
  );
  for (const fragment of apiNodes) {
    const material = materials.find(
      (item) => item.arguments.callId === fragment.nodeId,
    );
    if (!material)
      throw new Error(
        `binding fragment ${fragment.nodeId} has no API material`,
      );
    const expected = [
      ...new Set(
        material.arguments.bindings
          .map((binding) => binding.sourceNodeId)
          .filter((id) => outputs.has(id)),
      ),
    ].sort();
    const actual = (fragment.bindingSources ?? [])
      .filter((source) => source.kind === 'native-json')
      .map((source) => source.nodeId)
      .sort();
    if (!isDeepStrictEqual(expected, actual))
      throw new Error(
        `binding fragment ${fragment.nodeId} must declare every native producer exactly once`,
      );
    for (const source of fragment.bindingSources ?? []) {
      const producer =
        source.kind === 'api-response'
          ? apis.get(source.nodeId)
          : natives.get(source.nodeId);
      if (!producer || producer.exit.name !== source.nodeName)
        throw new Error(
          `binding source ${source.nodeId} does not match its compiled producer name/kind`,
        );
      if (
        source.kind === 'native-json' &&
        !isDeepStrictEqual(source.schema, outputs.get(source.nodeId)?.schema)
      )
        throw new Error(
          `binding source ${source.nodeId} does not match its declared native output schema`,
        );
      if (
        source.kind === 'api-response' &&
        source.operation &&
        !isDeepStrictEqual(
          source.operation,
          materials.find((item) => item.arguments.callId === source.nodeId)
            ?.operation,
        )
      )
        throw new Error(
          `binding source ${source.nodeId} does not match its original OAS response contract`,
        );
    }
  }
}
