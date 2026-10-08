import type {
  BindingSchema,
  ValidateApiBindingAssignmentsInput,
} from '../types/api-bindings.js';
import { pointerTokens } from './json-pointer.js';
import { requestBindingSchemas } from './request-binding-schema.js';
import { responseBindingSchemas } from './response-binding-schema.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import { validateNativeOutputContracts } from './validate-native-output-contracts.js';

function declaredTypes(schemas: BindingSchema[]): Set<string> {
  const types = new Set<string>();
  for (const schema of schemas) {
    if (typeof schema === 'boolean' || schema.type === undefined)
      return new Set();
    for (const type of Array.isArray(schema.type) ? schema.type : [schema.type])
      if (typeof type === 'string') types.add(type);
    if (schema.nullable === true) types.add('null');
  }
  return types;
}

export function validateApiBindingAssignments({
  calls,
  materials,
  nativeOutputs = [],
}: ValidateApiBindingAssignmentsInput): void {
  const byId = new Map(
    materials.map((material) => [material.callId, material]),
  );
  if (
    !materials.length ||
    byId.size !== materials.length ||
    materials.some((item) => !item.callId.trim())
  )
    throw new Error('binding materials require unique non-empty callIds');
  validateNativeOutputContracts(nativeOutputs);
  const nativeById = new Map(nativeOutputs.map((item) => [item.nodeId, item]));
  for (const output of nativeOutputs)
    if (byId.has(output.nodeId))
      throw new Error(
        `native output ${output.nodeId} duplicates an API callId`,
      );
  if (
    calls.length !== materials.length ||
    new Set(calls.map((call) => call.callId)).size !== materials.length
  )
    throw new Error(
      'binding plan must name every material callId exactly once',
    );
  const dependencies = new Map<string, string[]>();
  for (const call of calls) {
    const target = byId.get(call.callId);
    if (!target)
      throw new Error(`bindings: unknown target callId ${call.callId}`);
    const pointers: string[] = [];
    dependencies.set(call.callId, []);
    for (const binding of call.bindings) {
      if (binding.kind !== 'node-output')
        throw new Error('bindings.kind must be node-output');
      pointerTokens(binding.targetPointer);
      pointerTokens(binding.sourcePointer);
      const source = byId.get(binding.sourceNodeId);
      const native = nativeById.get(binding.sourceNodeId);
      if (!source && !native)
        throw new Error(
          `bindings: unknown sourceNodeId ${binding.sourceNodeId}`,
        );
      if (binding.sourceNodeId === call.callId)
        throw new Error(`bindings: self-reference ${call.callId}`);
      if (
        pointers.some(
          (pointer) =>
            pointer === binding.targetPointer ||
            pointer.startsWith(binding.targetPointer + '/') ||
            binding.targetPointer.startsWith(pointer + '/'),
        )
      )
        throw new Error(
          `bindings overlap at ${call.callId}${binding.targetPointer}`,
        );
      pointers.push(binding.targetPointer);
      const targets = requestBindingSchemas(target, binding.targetPointer);
      const sources = native
        ? schemasAtPointer(native.schema, binding.sourcePointer)
        : responseBindingSchemas(source!.operation, binding.sourcePointer);
      if (!targets.length)
        throw new Error(
          `bindings: ${call.callId}${binding.targetPointer} is not declared by the request OAS`,
        );
      if (!sources.length)
        throw new Error(
          `bindings: ${binding.sourceNodeId}${binding.sourcePointer} is not declared by the ${native ? 'native output contract' : 'response OAS'}`,
        );
      const from = declaredTypes(sources);
      const to = declaredTypes(targets);
      if (
        from.size &&
        to.size &&
        ![...from].some(
          (type) => to.has(type) || (type === 'integer' && to.has('number')),
        )
      )
        throw new Error(
          `bindings: incompatible OAS types ${binding.sourceNodeId}${binding.sourcePointer} -> ${call.callId}${binding.targetPointer}`,
        );
      dependencies.get(call.callId)!.push(binding.sourceNodeId);
    }
  }
  const pending = new Set(byId.keys());
  while (pending.size) {
    const ready = [...pending].filter((id) =>
      dependencies.get(id)!.every((source) => !pending.has(source)),
    );
    if (!ready.length) throw new Error('binding dependencies have a cycle');
    for (const id of ready) pending.delete(id);
  }
}
