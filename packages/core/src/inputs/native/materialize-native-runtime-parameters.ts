import type {
  NativeRuntimeParameterMaterialization,
  NativeRuntimeInputValues,
} from '../../types/native-runtime-inputs.js';
import type { JsonValueObject } from '../../types/api-arguments.js';
import { assignJsonInputValue } from '../../bindings/assign-json-input-value.js';
import { pointerTokens } from '../../bindings/json-pointer.js';
import { cloneJsonValue } from '../../utils/clone-json-value.js';

/** Pure runtime assignment shared by in-process inspection and generated offline n8n guards. */
export function materializeNativeRuntimeParameters(
  material: NativeRuntimeParameterMaterialization,
  values: NativeRuntimeInputValues,
): JsonValueObject {
  let parameters = cloneJsonValue(material.parameters) as JsonValueObject;
  const inputs = [...material.inputs].sort((left, right) => {
    const a = pointerTokens(left.targetPointer),
      b = pointerTokens(right.targetPointer);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      if (a[index] === b[index]) continue;
      return /^(0|[1-9][0-9]*)$/.test(a[index]) &&
        /^(0|[1-9][0-9]*)$/.test(b[index])
        ? Number(a[index]) - Number(b[index])
        : a[index].localeCompare(b[index]);
    }
    return a.length - b.length;
  });
  for (const source of inputs) {
    if (!Object.hasOwn(values, source.id))
      throw new Error(
        `Missing native runtime input ${source.id} for ${material.nodeId}${source.targetPointer}`,
      );
    const value = values[source.id];
    if (source.targetPointer === '') {
      if (
        inputs.length !== 1 ||
        Object.keys(parameters).length ||
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value)
      )
        throw new Error(
          `Native runtime input ${material.nodeId} must be an exclusive JSON parameter object`,
        );
      parameters = cloneJsonValue(value) as JsonValueObject;
    } else {
      parameters = assignJsonInputValue({
        values: parameters,
        pointer: source.targetPointer,
        value,
        source: `Native runtime input ${material.nodeId}`,
        containerKind(pointer) {
          if (!Object.hasOwn(source.containerKinds, pointer))
            throw new Error(
              `Native runtime input ${material.nodeId} has no declared container at ${pointer}`,
            );
          return source.containerKinds[pointer];
        },
      });
    }
  }
  return parameters;
}
