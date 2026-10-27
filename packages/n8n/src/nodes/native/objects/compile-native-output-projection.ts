import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import type { CompileNativeOutputProjectionInput } from '../../../types/native-output-projection.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createNativeOutputProjectionExpression } from './create-native-output-projection-expression.js';

export function compileNativeOutputProjection(
  input: CompileNativeOutputProjectionInput,
): N8nNodeFragment {
  const { planned, position, parameters } = input;
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const reader = createOutputReaderCode(
    [{ ...input.source, kind: 'native-json' }],
    true,
  );
  const checks = parameters.fields
    .filter((field) => field.measurement !== undefined)
    .map((field) => {
      const expected =
        field.measurement === 'utf16-code-units' ? 'string' : 'array';
      const value = `OpenApiFlowRequestRuntime.pointerValue(value,${javascriptJsonLiteral(field.pointer)})`;
      const valid =
        expected === 'string'
          ? `typeof measured==='string'`
          : 'Array.isArray(measured)';
      return `{const measured=${value};if(!(${valid}))throw new Error(${javascriptJsonLiteral(`Native measurement ${field.measurement} requires ${expected}: ${parameters.sourceNodeId}${field.pointer}`)});}`;
    })
    .join('\n');
  const read = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${planned.id}-read-native-fields`,
      name: `Read native fields ${planned.id}`,
      position,
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `${runtime}\nconst parameters=${javascriptJsonLiteral(parameters)};\nreturn $input.all().map((_,inputIndex)=>{${reader}\nconst value=responses[parameters.sourceNodeId];for(const field of parameters.fields){if(OpenApiFlowRequestRuntime.pointerValue(value,field.pointer)===undefined)throw new Error('Missing native pointer '+parameters.sourceNodeId+field.pointer);}${checks}\nreturn {json:value,pairedItem:{item:inputIndex}};});`,
      },
    },
  });
  const output = node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      id: planned.id,
      name: planned.id,
      position: [position[0] + 220, position[1]],
      parameters: {
        mode: 'raw',
        jsonOutput: createNativeOutputProjectionExpression(parameters),
        includeOtherFields: false,
        options: { dotNotation: false },
      },
    },
  });
  return {
    nodeId: planned.id,
    nodes: [read, output],
    entry: read,
    exit: output,
    inputPorts: { main: 0 },
    outputPorts: { main: 0 },
    internalEdges: [{ from: read.id, output: 0, to: output.id, input: 0 }],
    bindingSources: [{ ...input.source, kind: 'native-json' }],
  };
}
