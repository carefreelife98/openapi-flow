import { z } from 'zod';
import { createLiteralDataOutputSchema } from '../../schemas/create-literal-data-output-schema.js';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import { literalDataParametersSchema } from '../../schemas/literal-data-schema.js';
import { createJsonOutputCapability } from './create-json-output-capability.js';

/** Typed branch results through official Edit Fields; API data is never synthesized. */
export function createLiteralDataCapability(): N8nNativeCapability {
  return {
    name: 'emit-literal-data',
    description:
      'Create explicit typed scalar result fields using n8n Edit Fields. Use for branch outcomes or skip explanations; not for replacing missing API inputs or inventing API responses. main input/output.',
    parametersSchema: literalDataParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    parameterReferenceSources: [],
    parameterReferenceBindings: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    outputSchema: (parameters) =>
      z.toJSONSchema(createLiteralDataOutputSchema(parameters)),
    compile: (source) => {
      const { fields } = literalDataParametersSchema.parse(
        source.planned.parameters,
      );
      const values = Object.fromEntries(
        fields.map(({ name, value }) => [name, value]),
      );
      const capability = createJsonOutputCapability({
        name: 'emit-literal-data',
        description: 'Explicit branch result',
        parametersSchema: createLiteralDataOutputSchema(
          source.planned.parameters,
        ),
      });
      return capability.compile({
        ...source,
        planned: { ...source.planned, parameters: values },
      });
    },
  };
}
