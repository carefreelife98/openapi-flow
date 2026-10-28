import { validateApiArguments } from '@openapi-flow/core';
import type { Operation } from '@openapi-flow/core/internal';
import type { CreateHttpRequestNodeInput } from '../../../types/node-fragment.js';
import { httpRequestPaginationSchema } from '../../../schemas/http-request-pagination-schema.js';

/** Validate the complete explicitly bounded sequence before emitting native qs overrides. */
export function resolveHttpRequestPagination(
  input: CreateHttpRequestNodeInput,
  operation: Operation,
) {
  if (input.pagination === undefined) return undefined;
  const pagination = httpRequestPaginationSchema.parse(input.pagination);
  const name = pagination.parameter;
  const parameter = operation.parameters.find(
    (item) => item.in === 'query' && item.name === name,
  );
  if (
    !parameter ||
    parameter.style !== 'form' ||
    parameter.contentMediaType !== undefined
  )
    throw new Error(
      `pagination.parameter query.${name} requires a declared form OAS parameter without content`,
    );
  const target = '/query/' + name.replaceAll('~', '~0').replaceAll('/', '~1');
  if (
    input.arguments.bindings.some(
      (binding) =>
        binding.targetPointer === '/query' ||
        binding.targetPointer === target ||
        binding.targetPointer.startsWith(target + '/'),
    )
  )
    throw new Error(`pagination.parameter ${target} cannot also be bound`);
  if (input.arguments.values.query?.[name] !== pagination.start)
    throw new Error(
      `pagination.start must equal arguments.values.query.${name}`,
    );
  const span = (pagination.maxRequests - 1) * pagination.step;
  const last = pagination.start + span;
  if (!Number.isSafeInteger(span) || !Number.isSafeInteger(last))
    throw new Error('pagination sequence exceeds the safe integer range');
  // Native pagination bypasses the per-request materializer. Validate the entire
  // explicit sequence through core's public validator and existing compiled cache.
  // This is O(maxRequests); the host owns that budget, with no adapter-added cap.
  for (let index = 0; index < pagination.maxRequests; index++) {
    const value = pagination.start + index * pagination.step;
    try {
      validateApiArguments({
        operation: input.operation,
        values: {
          ...input.arguments.values,
          query: { ...input.arguments.values.query, [name]: value },
        },
        bindings: input.arguments.bindings,
        requestMediaType: input.arguments.requestMediaType,
      });
    } catch (cause) {
      throw new Error(
        `pagination query.${name} page ${index} value ${value} does not match the OAS schema`,
        { cause },
      );
    }
  }
  return pagination;
}
