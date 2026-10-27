import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import type { CompileApiResponseMapEntryInput } from '../../../types/api-response-map-entry.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createNativeFragment } from '../common/create-native-fragment.js';

export function compileApiResponseMapEntry(
  input: CompileApiResponseMapEntryInput,
): N8nNodeFragment {
  const { material, planned, parameters, position, linked } = input;
  if (
    !Object.hasOwn(input.apiNodeNames, material.callId) ||
    !input.apiNodeNames[material.callId].trim()
  )
    throw new Error(`apiNodeNames is missing ${material.callId}`);
  const source: N8nOutputBindingSource = {
    kind: 'api-response',
    nodeId: material.callId,
    nodeName: input.apiNodeNames[material.callId],
    operation: material.operation,
  };
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const reader = createOutputReaderCode([source], linked);
  const select = `${reader}\nconst object=OpenApiFlowRequestRuntime.pointerValue(responses[parameters.sourceNodeId],parameters.pointer);if(object===null||typeof object!=='object'||Array.isArray(object))throw new Error('Map entry source must be an object: '+parameters.sourceNodeId+parameters.pointer);if(!Object.hasOwn(object,parameters.key))throw new Error('Missing own object key '+JSON.stringify(parameters.key)+' at '+parameters.sourceNodeId+parameters.pointer);return {json:{key:parameters.key,value:object[parameters.key]},pairedItem:{item:inputIndex}};`;
  const parameterRead =
    planned.runtimeParameters === undefined
      ? `const parameters=${javascriptJsonLiteral(parameters)};`
      : 'const parameters=inputItems[inputIndex].json;';
  const jsCode = `${runtime}\nconst inputItems=$input.all();\n${linked ? '' : "if(inputItems.length!==1)throw new Error('Map entry selection requires one input item; got '+inputItems.length);"}\nreturn inputItems.map((_,inputIndex)=>{${parameterRead}\n${select}});`;
  const result = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: planned.id,
      name: planned.id,
      position,
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode,
      },
    },
  });
  return {
    ...createNativeFragment(result, ['main'], ['main']),
    bindingSources: [source],
  };
}
