import type { JsonObject } from '../../types/openapi.js';
import type {
  OperationBodyMedia,
  OperationParameter,
} from '../../types/request.js';
import { serializeQueryParameter } from './serialize-parameter.js';
import { UnsupportedOperationError } from '../common/unsupported-operation-error.js';
import { dereferencedObject } from '../common/parse-spec-utils.js';
import { isObject } from '../../utils/validation.js';

function defaultFieldMediaType(schema: JsonObject): string | undefined {
  const type =
    schema.type === 'array' && isObject(schema.items)
      ? schema.items.type
      : schema.type;
  if (type === 'object' || type === 'array') return 'application/json';
  if (['string', 'number', 'integer', 'boolean'].includes(String(type)))
    return 'text/plain';
  return undefined;
}

function encodedField(
  name: string,
  field: unknown,
  schema: JsonObject,
  contentType: string,
  operationRef: string,
): string[] {
  if (contentType !== 'application/json' && contentType !== 'text/plain')
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef}.requestBody field ${name} contentType ${contentType} has no form mapping`,
    );
  const values = Array.isArray(field) ? field : [field];
  if (values.length === 0) return [];
  const form = new URLSearchParams();
  for (const value of values) {
    if (contentType === 'text/plain' && typeof value === 'object')
      throw new UnsupportedOperationError(
        operationRef,
        `operationRef ${operationRef}.requestBody field ${name} cannot use text/plain for a complex value`,
      );
    if (contentType === 'application/json') {
      form.append(name, JSON.stringify(value));
    } else {
      form.append(name, String(value));
    }
  }
  if (schema.contentEncoding !== undefined)
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef}.requestBody field ${name} contentEncoding requires explicit binary serialization`,
    );
  return form.toString().split('&');
}

function formFieldSchema(
  operationRef: string,
  media: OperationBodyMedia,
  name: string,
): JsonObject {
  const source = `operationRef ${operationRef}.requestBody.schema.properties.${name}`;
  const declared = media.properties[name];
  if (declared !== undefined) {
    if (typeof declared === 'boolean')
      throw new UnsupportedOperationError(
        operationRef,
        `${source} does not define a form encoding type`,
      );
    return dereferencedObject(declared, source);
  }
  if (isObject(media.schema) && media.schema.additionalProperties !== undefined)
    if (typeof media.schema.additionalProperties !== 'boolean')
      return dereferencedObject(
        media.schema.additionalProperties,
        `operationRef ${operationRef}.requestBody.schema.additionalProperties`,
      );
  throw new UnsupportedOperationError(
    operationRef,
    `operationRef ${operationRef}.requestBody field ${name} has no schema to determine form encoding`,
  );
}

export function serializeFormBody(
  operationRef: string,
  media: OperationBodyMedia,
  value: JsonObject,
): string {
  const parts: string[] = [];
  for (const [name, field] of Object.entries(value)) {
    const schema = formFieldSchema(operationRef, media, name);
    const rawEncoding = media.encoding?.[name];
    const encoding =
      rawEncoding === undefined
        ? undefined
        : dereferencedObject(
            rawEncoding,
            `operationRef ${operationRef}.requestBody.encoding.${name}`,
          );
    if (
      encoding?.encoding !== undefined ||
      encoding?.prefixEncoding !== undefined ||
      encoding?.itemEncoding !== undefined
    )
      throw new UnsupportedOperationError(
        operationRef,
        `operationRef ${operationRef}.requestBody field ${name} needs nested encoding`,
      );
    const usesStyle =
      encoding?.style !== undefined ||
      encoding?.explode !== undefined ||
      encoding?.allowReserved !== undefined;
    if (usesStyle) {
      const style =
        typeof encoding?.style === 'string' ? encoding.style : 'form';
      const parameter: OperationParameter = {
        name,
        in: 'query',
        required: false,
        schema,
        style,
        explode:
          typeof encoding?.explode === 'boolean'
            ? encoding.explode
            : style === 'form',
        allowReserved: encoding?.allowReserved === true,
      };
      parts.push(...serializeQueryParameter(parameter, operationRef, field));
      continue;
    }
    const contentType =
      typeof encoding?.contentType === 'string'
        ? encoding.contentType
        : defaultFieldMediaType(schema);
    if (contentType === undefined)
      throw new UnsupportedOperationError(
        operationRef,
        `operationRef ${operationRef}.requestBody field ${name} has no form content mapping`,
      );
    parts.push(...encodedField(name, field, schema, contentType, operationRef));
  }
  return parts.join('&');
}
