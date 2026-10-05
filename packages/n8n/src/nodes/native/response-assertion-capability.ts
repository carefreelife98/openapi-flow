import { node } from '@n8n/workflow-sdk';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import { assertionParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createNativeFragment } from './common/create-native-fragment.js';
import { responseReferences } from './common/response-references.js';
import { responseCheckCode } from './response-check-code.js';

export function createResponseAssertionCapability(): N8nNativeCapability {
  return {
    name: 'assert-responses',
    description:
      'n8n Code: library-generated JSON comparisons. main input/output. Returns pass/assertionCount or throws a check message. Join branches before comparing their responses.',
    parametersSchema: assertionParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: (parameters) =>
      responseReferences(assertionParametersSchema.parse(parameters).checks),
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: ({ planned, apiNodeNames, position }) => {
      const parameters = assertionParametersSchema.parse(planned.parameters);
      const code = `${responseCheckCode(apiNodeNames)}\nconst checks = ${JSON.stringify(parameters.checks)};\nfor (const check of checks) if (!compare(check)) throw new Error(check.message);\nreturn [{json: {pass: true, assertionCount: checks.length}}];`;
      return createNativeFragment(
        node({
          type: 'n8n-nodes-base.code',
          version: 2,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {
              mode: 'runOnceForAllItems',
              language: 'javaScript',
              jsCode: code,
            },
          },
        }),
        ['main'],
        ['main'],
      );
    },
  };
}
