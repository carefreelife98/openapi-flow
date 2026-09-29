import type { JsonObject } from '../../types/openapi.js';
import type {
  OperationResponses,
  ResponseProperties,
} from '../../types/request.js';
import { dereferencedObject, object } from '../common/parse-spec-utils.js';

export function parseOperationResponses(
  operation: JsonObject,
  operationRef: string,
): OperationResponses {
  const responses = object(
    operation.responses,
    `operationRef ${operationRef}.responses`,
  );
  const parsedResponses: OperationResponses = {};
  for (const [responseCode, rawResponse] of Object.entries(responses)) {
    const response = dereferencedObject(
      rawResponse,
      `operationRef ${operationRef}.responses.${responseCode}`,
    );
    const responseProperties: ResponseProperties = {};
    if (response.content !== undefined) {
      const content = object(
        response.content,
        `operationRef ${operationRef}.responses.${responseCode}.content`,
      );
      if (content['application/json'] !== undefined) {
        const media = object(
          content['application/json'],
          `operationRef ${operationRef}.responses.${responseCode}.application/json`,
        );
        const responseSchema =
          media.schema === undefined || typeof media.schema === 'boolean'
            ? undefined
            : dereferencedObject(
                media.schema,
                `operationRef ${operationRef}.responses.${responseCode}.schema`,
              );
        if (
          responseSchema?.type === 'object' &&
          responseSchema.properties !== undefined
        ) {
          const properties = object(
            responseSchema.properties,
            `operationRef ${operationRef}.responses.${responseCode}.schema.properties`,
          );
          for (const [name, property] of Object.entries(properties)) {
            responseProperties[name] =
              typeof property === 'boolean'
                ? property
                : dereferencedObject(
                    property,
                    `operationRef ${operationRef}.responses.${responseCode}.schema.properties.${name}`,
                  );
          }
        }
      }
    }
    parsedResponses[responseCode] = responseProperties;
  }
  return parsedResponses;
}
