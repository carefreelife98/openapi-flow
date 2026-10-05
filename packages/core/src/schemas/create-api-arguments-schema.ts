import { z } from 'zod';
import type {
  ApiArgumentProposal,
  ApiArgumentsSchemaInput,
  ApiArgumentValues,
} from '../types/api-arguments.js';
import type { JsonObject } from '../types/openapi.js';
import { object } from '../openapi/common/parse-spec-utils.js';
import {
  bodyMediaSchema,
  parameterSchema,
} from '../arguments/request-contract.js';
import { optionalRequestProperties } from './operation-plan-schema.js';
import { pointerTokens } from '../bindings/json-pointer.js';

export function createApiArgumentsSchema({
  operation,
  bindings,
  requestMediaType,
}: ApiArgumentsSchemaInput): z.ZodType<ApiArgumentProposal> {
  if (!Array.isArray(bindings))
    throw new Error('arguments.bindings must be an array');
  const dialect = operation.openapiVersion.startsWith('3.0.')
    ? 'openapi-3.0'
    : 'draft-2020-12';
  const groups: Record<string, Record<string, z.ZodType>> = {};
  for (const raw of operation.effective.parameters) {
    const parameter = object(raw, `${operation.key.operationRef}.parameters`);
    const location = String(parameter.in);
    const name = String(parameter.name);
    if (
      location === 'header' &&
      ['accept', 'content-type', 'authorization'].includes(name.toLowerCase())
    )
      continue;
    const pointer =
      '/' + location + '/' + name.replaceAll('~', '~0').replaceAll('/', '~1');
    if (bindings.some((binding) => binding.targetPointer === pointer)) continue;
    const schema = optionalRequestProperties(
      parameterSchema(parameter, pointer),
    ) as JsonObject | boolean;
    const value = z
      .fromJSONSchema(schema, { defaultTarget: dialect })
      .describe(
        typeof parameter.description === 'string'
          ? parameter.description
          : `Scenario value for ${location} parameter ${name}`,
      );
    if (!Object.hasOwn(groups, location)) groups[location] = {};
    Object.defineProperty(groups[location], name, {
      value: value.optional(),
      enumerable: true,
    });
  }
  const fields: Record<string, z.ZodType> = Object.fromEntries(
    Object.entries(groups).map(([location, properties]) => [
      location,
      z.object(properties).strict().optional(),
    ]),
  );
  const body = bodyMediaSchema(operation, requestMediaType);
  if (
    body !== undefined &&
    !bindings.some((binding) => binding.targetPointer === '/body')
  ) {
    const proposal = structuredClone(optionalRequestProperties(body)) as
      JsonObject | boolean;
    for (const binding of bindings.filter((entry) =>
      entry.targetPointer.startsWith('/body/'),
    )) {
      const tokens = pointerTokens(binding.targetPointer).slice(1);
      let current: unknown = proposal;
      for (const [index, token] of tokens.entries()) {
        if (!current || typeof current !== 'object')
          throw new Error(
            `${binding.targetPointer} cannot be represented by this request schema`,
          );
        const schema = current as JsonObject;
        const properties = object(
          schema.properties,
          `${binding.targetPointer}.properties`,
        );
        if (index === tokens.length - 1) delete properties[token];
        else current = properties[token];
      }
    }
    fields.body = z
      .fromJSONSchema(proposal, { defaultTarget: dialect })
      .describe(
        'Request body values explicitly supplied by the scenario; bound fields are supplied by preceding nodes.',
      )
      .optional();
  }
  return z
    .object({
      values: z.object(fields).strict() as z.ZodType<ApiArgumentValues>,
    })
    .strict();
}
