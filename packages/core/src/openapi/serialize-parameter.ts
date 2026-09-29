import type { OperationParameter, Scalar } from '../types/openapi.js';
import { isObject } from '../utils/validation.js';
import { UnsupportedOperationError } from './unsupported-operation-error.js';

function unsupported(
  parameter: OperationParameter,
  operationRef: string,
  reason: string,
): never {
  throw new UnsupportedOperationError(
    operationRef,
    `operationRef ${operationRef} parameter ${parameter.in}.${parameter.name} ${reason}`,
  );
}

function flatValue(
  parameter: OperationParameter,
  operationRef: string,
  value: unknown,
): Scalar {
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  return unsupported(parameter, operationRef, 'requires a scalar value');
}

function encoded(value: Scalar, allowReserved: boolean): string {
  const escaped = encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
  );
  if (!allowReserved) return escaped;
  return escaped.replace(
    /%(3A|2F|3F|23|5B|5D|40|21|24|26|27|28|29|2A|2B|2C|3B|3D)/gi,
    (match) => String.fromCharCode(Number.parseInt(match.slice(1), 16)),
  );
}

function entries(
  parameter: OperationParameter,
  operationRef: string,
  value: unknown,
  encode: (scalar: Scalar) => string,
): string[] {
  if (Array.isArray(value))
    return value.map((item) =>
      encode(flatValue(parameter, operationRef, item)),
    );
  if (isObject(value))
    return Object.entries(value).flatMap(([key, item]) => [
      encode(key),
      encode(flatValue(parameter, operationRef, item)),
    ]);
  return [encode(flatValue(parameter, operationRef, value))];
}

function contentValue(
  parameter: OperationParameter,
  operationRef: string,
  value: unknown,
): string {
  if (parameter.contentMediaType !== 'application/json')
    return unsupported(parameter, operationRef, 'has no content mapping');
  const result = JSON.stringify(value);
  if (result === undefined)
    return unsupported(parameter, operationRef, 'cannot be JSON serialized');
  return result;
}

export function serializePathParameter(
  parameter: OperationParameter,
  operationRef: string,
  value: unknown,
): string {
  if (parameter.contentMediaType) {
    return encoded(contentValue(parameter, operationRef, value), false);
  }
  const encode = (scalar: Scalar) => encoded(scalar, parameter.allowReserved);
  const parts = entries(parameter, operationRef, value, encode);
  const object = isObject(value);
  if (parameter.style === 'simple') {
    if (!object || !parameter.explode) return parts.join(',');
    return parts
      .flatMap((item, index) =>
        index % 2 === 0 ? [item + '=' + parts[index + 1]] : [],
      )
      .join(',');
  }
  if (parameter.style === 'label') {
    if (!object || !parameter.explode)
      return '.' + parts.join(parameter.explode ? '.' : ',');
    return (
      '.' +
      parts
        .flatMap((item, index) =>
          index % 2 === 0 ? [item + '=' + parts[index + 1]] : [],
        )
        .join('.')
    );
  }
  if (parameter.style === 'matrix') {
    const name = encoded(parameter.name, false);
    if (!parameter.explode) return ';' + name + '=' + parts.join(',');
    if (object)
      return parts
        .flatMap((item, index) =>
          index % 2 === 0 ? [';' + item + '=' + parts[index + 1]] : [],
        )
        .join('');
    return parts.map((item) => ';' + name + '=' + item).join('');
  }
  return unsupported(
    parameter,
    operationRef,
    `style ${parameter.style} is not a path style`,
  );
}

export function serializeQueryParameter(
  parameter: OperationParameter,
  operationRef: string,
  value: unknown,
): string[] {
  const name = encoded(parameter.name, false);
  if (parameter.contentMediaType)
    return [
      name + '=' + encoded(contentValue(parameter, operationRef, value), false),
    ];
  const encode = (scalar: Scalar) => encoded(scalar, parameter.allowReserved);
  const parts = entries(parameter, operationRef, value, encode);
  const object = isObject(value);
  if (parameter.style === 'deepObject') {
    if (!object)
      return unsupported(
        parameter,
        operationRef,
        'deepObject requires an object',
      );
    return parts.flatMap((item, index) =>
      index % 2 === 0 ? [name + '%5B' + item + '%5D=' + parts[index + 1]] : [],
    );
  }
  if (parameter.style === 'form') {
    if (!parameter.explode) return [name + '=' + parts.join(',')];
    if (object)
      return parts.flatMap((item, index) =>
        index % 2 === 0 ? [item + '=' + parts[index + 1]] : [],
      );
    return parts.map((item) => name + '=' + item);
  }
  if (
    (parameter.style === 'spaceDelimited' ||
      parameter.style === 'pipeDelimited') &&
    !parameter.explode &&
    (object || Array.isArray(value))
  ) {
    return [
      name +
        '=' +
        parts.join(parameter.style === 'spaceDelimited' ? '%20' : '%7C'),
    ];
  }
  return unsupported(
    parameter,
    operationRef,
    `style ${parameter.style} is not mapped for query`,
  );
}

export function serializeHeaderParameter(
  parameter: OperationParameter,
  operationRef: string,
  value: unknown,
): string {
  if (parameter.contentMediaType)
    return contentValue(parameter, operationRef, value);
  if (parameter.style !== 'simple')
    return unsupported(
      parameter,
      operationRef,
      `style ${parameter.style} is not a header style`,
    );
  const parts = entries(parameter, operationRef, value, String);
  const result =
    isObject(value) && parameter.explode
      ? parts
          .flatMap((item, index) =>
            index % 2 === 0 ? [item + '=' + parts[index + 1]] : [],
          )
          .join(',')
      : parts.join(',');
  if (/[\r\n]/.test(result))
    throw new Error(
      `plan.inputs.header.${parameter.name} must not contain a newline`,
    );
  return result;
}

export function serializeCookieParameter(
  parameter: OperationParameter,
  operationRef: string,
  value: unknown,
): string[] {
  if (parameter.contentMediaType)
    return unsupported(
      parameter,
      operationRef,
      'cookie content needs a declared escaping strategy',
    );
  if (parameter.style !== 'form' && parameter.style !== 'cookie')
    return unsupported(
      parameter,
      operationRef,
      `style ${parameter.style} is not a cookie style`,
    );
  const encode =
    parameter.style === 'cookie'
      ? (scalar: Scalar) => String(scalar)
      : (scalar: Scalar) => encoded(scalar, parameter.allowReserved);
  const parts = entries(parameter, operationRef, value, encode);
  const name = encode(parameter.name);
  if (!parameter.explode && (isObject(value) || Array.isArray(value)))
    return unsupported(
      parameter,
      operationRef,
      'explode:false produces invalid Cookie syntax',
    );
  const result = isObject(value)
    ? parts.flatMap((item, index) =>
        index % 2 === 0 ? [item + '=' + parts[index + 1]] : [],
      )
    : parts.map((item) => name + '=' + item);
  if (
    result.some((part) =>
      [...part].some((character) => {
        const code = character.charCodeAt(0);
        return (
          code <= 32 ||
          code === 34 ||
          code === 44 ||
          code === 59 ||
          code === 92 ||
          code === 127
        );
      }),
    )
  )
    return unsupported(
      parameter,
      operationRef,
      'value is not valid Cookie syntax',
    );
  return result;
}
