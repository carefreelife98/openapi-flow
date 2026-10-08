import { node } from '@n8n/workflow-sdk';
import { z } from 'zod';
import { parseNativeNodeParameters } from '@openapi-flow/core';
import type {
  CreateJsonOutputCapabilityInput,
  N8nNativeCapability,
} from '../../types/native-capability.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';
import { createNativeFragment } from './common/create-native-fragment.js';

/** Explicit typed literals through Edit Fields JSON mode; no casts or mapping expressions. */
export function createJsonOutputCapability(
  input: CreateJsonOutputCapabilityInput,
): N8nNativeCapability {
  if (!input.name.trim() || !input.description.trim())
    throw new Error('JSON output capability requires name and description');
  const capability: N8nNativeCapability = {
    ...input,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    outputSchema: () =>
      z.toJSONSchema(input.parametersSchema, { io: 'output' }),
    compile: ({ planned, position }) => {
      const parameters = parseNativeNodeParameters(planned, capability);
      return createNativeFragment(
        node({
          type: 'n8n-nodes-base.set',
          version: 3.4,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {
              mode: 'raw',
              jsonOutput: `={{ ${javascriptJsonLiteral(parameters)} }}`,
              includeOtherFields: false,
              options: { dotNotation: false },
            },
          },
        }),
        ['main'],
        ['main'],
      );
    },
  };
  return capability;
}
