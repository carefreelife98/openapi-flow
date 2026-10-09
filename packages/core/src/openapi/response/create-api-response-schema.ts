import type { ApiResponseValidationInput } from '../../types/api-response.js';
import type { JsonObject } from '../../types/openapi.js';
import { isObject } from '../../utils/is-object.js';
import { createOasValueValidator } from '../common/create-oas-value-validator.js';

function statusSchema(key: string, keys: string[]): JsonObject {
  if (/^[1-5][0-9]{2}$/.test(key)) return { const: Number(key) };
  if (/^[1-5]XX$/.test(key))
    return {
      minimum: Number(key[0]) * 100,
      maximum: Number(key[0]) * 100 + 99,
      ...(keys.some((item) => /^[1-5][0-9]{2}$/.test(item))
        ? {
            not: {
              enum: keys
                .filter((item) => /^[1-5][0-9]{2}$/.test(item))
                .map(Number),
            },
          }
        : {}),
    };
  if (key === 'default')
    return keys.some((item) => item !== 'default')
      ? {
          not: {
            anyOf: keys
              .filter((item) => item !== 'default')
              .map((item) => statusSchema(item, keys)),
          },
        }
      : {};
  throw new Error(`responses.${key} is not an OAS response status`);
}

function mediaPattern(media: string): string {
  return (
    '^' +
    media
      .toLowerCase()
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/;]+') +
    '$'
  );
}

/** Validate the observed response, not an LLM-planned expected status. */
export function createApiResponseSchema({
  operation,
}: ApiResponseValidationInput): JsonObject {
  const responses = operation.operation.responses;
  if (!isObject(responses))
    throw new Error(`${operation.key.operationRef}.responses is required`);
  const keys = Object.keys(responses).filter((key) => !key.startsWith('x-'));
  const dialect = operation.openapiVersion.startsWith('3.0.')
    ? 'openapi-3.0'
    : 'draft-2020-12';
  const branches = keys.flatMap((key) => {
    const response = responses[key];
    if (!isObject(response))
      throw new Error(
        `${operation.key.operationRef}.responses.${key} must be resolved`,
      );
    if ('$ref' in response)
      throw new Error(
        `${operation.key.operationRef}.responses.${key} must be resolved`,
      );
    const status = statusSchema(key, keys);
    const content = response.content;
    if (!isObject(content) || !Object.keys(content).length)
      return [{ properties: { statusCode: status } }];
    const mediaTypes = Object.keys(content);
    return mediaTypes.map((mediaType) => {
      const media = content[mediaType];
      if (!isObject(media))
        throw new Error(
          `${operation.key.operationRef}.responses.${key}.content.${mediaType} must be resolved`,
        );
      if ('$ref' in media)
        throw new Error(
          `${operation.key.operationRef}.responses.${key}.content.${mediaType} must be resolved`,
        );
      const schema = media.schema;
      if (
        schema !== undefined &&
        typeof schema !== 'boolean' &&
        !isObject(schema)
      )
        throw new Error(
          `${operation.key.operationRef}.responses.${key}.content.${mediaType}.schema must be an OAS schema`,
        );
      const body =
        schema === undefined
          ? true
          : createOasValueValidator(
              schema,
              dialect,
              `${operation.key.documentId}${operation.key.operationRef}/responses/${key}/${mediaType}`,
            ).schema;
      const moreSpecific = mediaTypes.filter(
        (other) =>
          other !== mediaType &&
          (mediaType === '*/*'
            ? other !== '*/*'
            : mediaType.endsWith('/*') &&
              !other.includes('*') &&
              other.split('/')[0].toLowerCase() ===
                mediaType.split('/')[0].toLowerCase()),
      );
      return {
        properties: {
          statusCode: status,
          mediaType: {
            pattern: mediaPattern(mediaType),
            ...(moreSpecific.length
              ? {
                  not: {
                    anyOf: moreSpecific.map((other) => ({
                      pattern: mediaPattern(other),
                    })),
                  },
                }
              : {}),
          },
          body,
        },
        required: ['mediaType'],
      };
    });
  });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      statusCode: { type: 'integer', minimum: 100, maximum: 599 },
      mediaType: { type: 'string' },
      body: true,
    },
    required: ['statusCode'],
    ...(branches.length ? { anyOf: branches } : { not: {} }),
  };
}
