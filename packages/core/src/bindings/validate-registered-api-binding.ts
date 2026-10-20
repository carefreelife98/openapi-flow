import type { BindingSchema } from '../types/api-bindings.js';
import type { ValidateRegisteredApiBindingInput } from '../types/binding-validation-internal.js';
import { pointerTokens } from './json-pointer.js';
import { requestBindingSchemas } from './request-binding-schema.js';
import { responseBindingSchemas } from './response-binding-schema.js';
import { nativeBindingSchemas } from './native-binding-schema.js';

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

/** One declared source-to-input contract, not a whole graph/readiness assertion. */
export function validateRegisteredApiBinding({
  callId,
  binding,
  registry,
}: ValidateRegisteredApiBindingInput): void {
  const target = registry.api.get(callId);
  if (!target) throw new Error(`bindings: unknown target callId ${callId}`);
  if (!binding || binding.kind !== 'node-output')
    throw new Error('bindings.kind must be node-output');
  if (
    typeof binding.targetPointer !== 'string' ||
    typeof binding.sourcePointer !== 'string'
  )
    throw new Error(
      'bindings.targetPointer and sourcePointer must be JSON Pointer strings',
    );
  if (typeof binding.sourceNodeId !== 'string' || !binding.sourceNodeId.trim())
    throw new Error('bindings.sourceNodeId must be a non-empty string');
  pointerTokens(binding.targetPointer);
  pointerTokens(binding.sourcePointer);
  const source = registry.api.get(binding.sourceNodeId);
  const native = registry.native.get(binding.sourceNodeId);
  if (!source && !native)
    throw new Error(`bindings: unknown sourceNodeId ${binding.sourceNodeId}`);
  if (binding.sourceNodeId === callId)
    throw new Error(`bindings: self-reference ${callId}`);
  const targets = requestBindingSchemas(target, binding.targetPointer);
  const sources = native
    ? nativeBindingSchemas(native, binding.sourcePointer)
    : responseBindingSchemas(source!.operation, binding.sourcePointer);
  if (!targets.length)
    throw new Error(
      `bindings: ${callId}${binding.targetPointer} is not declared by the request OAS`,
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
      `bindings: incompatible OAS types ${binding.sourceNodeId}${binding.sourcePointer} -> ${callId}${binding.targetPointer}`,
    );
}
