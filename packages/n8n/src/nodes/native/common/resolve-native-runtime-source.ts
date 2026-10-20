import { isDeepStrictEqual } from 'node:util';
import type { ResolveNativeRuntimeSourceInput } from '../../../types/native-material-binding.js';
import type { N8nNativeOutputSource } from '../../../types/output-binding-source.js';

export function resolveNativeRuntimeSource(
  input: ResolveNativeRuntimeSourceInput,
): N8nNativeOutputSource {
  if (
    input.binding.kind === 'compiled' &&
    !Array.isArray(input.compiledSources)
  )
    throw new Error(
      `Native ${input.consumerId}: compile.nativeOutputSources is required for the current material revision`,
    );
  const sources =
    input.binding.kind === 'provided'
      ? input.binding.sources
      : input.compiledSources!;
  const matches = sources.filter(
    (source) => source.nodeId === input.contract.nodeId,
  );
  if (
    matches.length !== 1 ||
    !matches[0].nodeName?.trim() ||
    !isDeepStrictEqual(matches[0].schema, input.contract.schema)
  )
    throw new Error(
      `Native ${input.consumerId}: source ${input.contract.nodeId} requires exactly one matching actual compiled name/schema`,
    );
  return matches[0];
}
