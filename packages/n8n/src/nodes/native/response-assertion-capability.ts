import { node } from '@n8n/workflow-sdk';
import type {
  N8nNativeCapability,
  NativeItemExecutionOptions,
} from '../../types/native-capability.js';
import { assertionParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createNativeFragment } from './common/create-native-fragment.js';
import { responseReferences } from './common/response-references.js';
import { responseCheckCode } from './response-check-code.js';
import { createResponseCheckReader } from './response-checks/create-response-check-reader.js';

export function createResponseAssertionCapability(
  input: NativeItemExecutionOptions = {},
): N8nNativeCapability {
  return {
    name: 'assert-responses',
    description:
      'n8n Code: library-generated JSON comparisons. main input/output. Returns pass/assertionCount on success and can be the final node; no separate success/end node is needed. Failed checks throw their message and fail the workflow, without a failure output port. Join branches before comparing their responses.',
    parametersSchema: assertionParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: (parameters) =>
      responseReferences(assertionParametersSchema.parse(parameters).checks),
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: ({ planned, apiNodeNames, apiResponseContracts, position }) => {
      const parameters = assertionParametersSchema.parse(planned.parameters);
      const reader = createResponseCheckReader({
        nodeId: planned.id,
        checks: parameters.checks,
        apiNodeNames,
        apiResponseContracts,
        linked: input.itemMode === 'linked',
      });
      const checkCode = `${responseCheckCode(reader.code)}\nconst checks = ${JSON.stringify(parameters.checks)};\nfor (const check of checks) if (!compare(check)) throw new Error(check.message);`;
      const code =
        input.itemMode === 'linked'
          ? `return $input.all().map((_,inputIndex)=>{${checkCode}\nreturn {json:{pass:true,assertionCount:checks.length},pairedItem:{item:inputIndex}};});`
          : `${checkCode}\nreturn [{json: {pass: true, assertionCount: checks.length}}];`;
      const fragment = createNativeFragment(
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
      return {
        ...fragment,
        preservesInputItems: input.itemMode === 'linked',
        bindingSources: reader.bindingSources,
      };
    },
  };
}
