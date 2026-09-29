import type { Operation } from '../../types/request.js';
import type {
  EffectPolicy,
  OperationEffect,
} from '../../types/request-workflow.js';
import { isObject } from '../../utils/is-object.js';

export function isSafeMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'QUERY'].includes(method);
}

export function approvedEffect(
  operation: Operation,
  effectPolicy: EffectPolicy,
): OperationEffect {
  if (!isObject(effectPolicy)) {
    throw new Error(
      'effectPolicy must be a trusted operationRef-to-effect map',
    );
  }
  if (!Object.hasOwn(effectPolicy, operation.operationRef)) return 'unknown';
  const effect = effectPolicy[operation.operationRef];
  if (effect !== 'read' && effect !== 'write') {
    throw new Error(
      'effectPolicy.' + operation.operationRef + ' must be read or write',
    );
  }
  return effect;
}
