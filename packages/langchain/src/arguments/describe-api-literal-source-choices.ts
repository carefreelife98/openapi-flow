import { z } from 'zod';
import {
  describeApiLiteralJsonSources,
  listApiRequestInputRoots,
  pointerTokens,
} from '@openapi-flow/core';
import type {
  ApiArgumentGenerationContract,
  ApiArgumentValues,
  JsonObject,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type { ApiLiteralSourceChoiceGroup } from '../types/api-literal-source-choices.js';

/** The model and its schema see the same source candidates scoped to each input's literal contract. */
export function describeApiLiteralSourceChoices(
  messages: WorkflowSourceMessage[],
  contract: ApiArgumentGenerationContract,
): ApiLiteralSourceChoiceGroup[] {
  const requestSchema = z.toJSONSchema(contract.valuesSchema) as JsonObject;
  const roots = listApiRequestInputRoots(requestSchema);
  const groups: ApiLiteralSourceChoiceGroup[] = [];
  for (const entry of describeApiLiteralJsonSources(messages))
    for (const root of roots) {
      const parts = pointerTokens(root);
      const locations = requestSchema.properties as Record<string, JsonObject>;
      const rootSchema =
        parts[0] === 'body'
          ? locations.body
          : (locations[parts[0]].properties as Record<string, JsonObject>)[
              parts[1]
            ];
      if (rootSchema === undefined)
        throw new Error(`literalInputSchema is missing ${root}`);
      const compatible = entry.json.filter((candidate) => {
        const value = JSON.parse(candidate.text);
        const projected: ApiArgumentValues =
          parts[0] === 'body'
            ? { body: value }
            : { [parts[0]]: { [parts[1]]: value } };
        return contract.valuesSchema.safeParse(projected).success;
      });
      groups.push({
        messageId: entry.messageId,
        inputRoot: root,
        descendants: false,
        candidates: compatible,
      });
      // Primitive roots have no descendant input. Open/ref/union contracts are checked at assignment.
      const type = rootSchema.type;
      if (
        type === undefined ||
        type === 'object' ||
        type === 'array' ||
        (Array.isArray(type) &&
          type.some((item) => item === 'object' || item === 'array'))
      )
        groups.push({
          messageId: entry.messageId,
          inputRoot: root,
          descendants: true,
          candidates: entry.json,
        });
    }
  return groups;
}
