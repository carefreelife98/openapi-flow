import { z } from 'zod';
import type {
  ApiArgumentsSchemaInput,
  ApiArgumentValues,
} from '../types/api-arguments.js';
import type { ApiArgumentGenerationContract } from '../types/api-argument-generation.js';
import type { JsonObject } from '../types/openapi.js';
import { object } from '../openapi/common/parse-spec-utils.js';
import {
  bodyMediaSchema,
  parameterSchema,
} from '../arguments/request-contract.js';
import { validateApiArguments } from '../arguments/validate-api-arguments.js';
import { optionalRequestProperties } from './operation-plan-schema.js';
import { pointerTokens } from '../bindings/json-pointer.js';
import { requestBindingSchemas } from '../bindings/request-binding-schema.js';
import { projectLiteralInputSchema } from './project-literal-input-schema.js';
import { createOasValueSchema } from './create-oas-value-schema.js';

/** The OAS-derived schema decides whether the model has any values to propose. */
export function createApiArgumentGenerationContract({
  operation,
  bindings,
  requestMediaType,
}: ApiArgumentsSchemaInput): ApiArgumentGenerationContract {
  if (!Array.isArray(bindings))
    throw new Error('arguments.bindings must be an array');
  validateApiArguments({ operation, bindings, requestMediaType, values: {} });
  for (const binding of bindings)
    if (
      !requestBindingSchemas(
        { operation, requestMediaType, callId: operation.key.operationRef },
        binding.targetPointer,
      ).length
    )
      throw new Error(
        `binding ${binding.targetPointer} is not declared by ${operation.key.operationRef}`,
      );
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
    const projection = projectLiteralInputSchema(
      optionalRequestProperties(parameterSchema(parameter, pointer)) as
        JsonObject | boolean,
      bindings
        .filter((entry) => entry.targetPointer.startsWith(pointer + '/'))
        .map((entry) => pointerTokens(entry.targetPointer).slice(2)),
      pointer,
    );
    if (!projection.hasLiteralValues) continue;
    const value = createOasValueSchema(
      projection.schema,
      dialect,
      `${operation.key.operationRef}${pointer}`,
    ).describe(
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
    const projection = projectLiteralInputSchema(
      optionalRequestProperties(body) as JsonObject | boolean,
      bindings
        .filter((entry) => entry.targetPointer.startsWith('/body/'))
        .map((entry) => pointerTokens(entry.targetPointer).slice(1)),
      '/body',
    );
    if (projection.hasLiteralValues)
      fields.body = createOasValueSchema(
        projection.schema,
        dialect,
        `${operation.key.operationRef}/body`,
      )
        .describe(
          'Request body literal values explicitly supplied by the scenario; forbidden properties are owned by preceding nodes.',
        )
        .optional();
  }
  const schema = z
    .object({
      values: z.object(fields).strict() as z.ZodType<ApiArgumentValues>,
    })
    .strict();
  return {
    schema,
    literalInputSchema: z.toJSONSchema(schema) as JsonObject,
    hasLiteralInputs: Object.keys(fields).length > 0,
  };
}
