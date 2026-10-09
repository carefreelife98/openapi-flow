import { readFileSync } from 'node:fs';
import type { N8nOutputBindingSource } from '../../types/output-binding-source.js';
import type { ResponseArrayParameters } from '../../types/array-iteration.js';
import { createOutputReaderCode } from '../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';

export function createResponseArrayReaderCode(
  source: N8nOutputBindingSource,
  parameters: ResponseArrayParameters,
  linked: boolean,
): string {
  const runtime = readFileSync(
    new URL('../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const read = createOutputReaderCode([source], linked);
  const extract = `${read}\nconst parameters=${javascriptJsonLiteral(parameters)};\nconst array=OpenApiFlowRequestRuntime.pointerValue(responses[parameters.sourceNodeId],parameters.pointer);if(!Array.isArray(array))throw new Error('Response '+parameters.sourceNodeId+parameters.pointer+' must be an array');`;
  const iteration = linked
    ? `return inputItems.map((_,inputIndex)=>{${extract}\nreturn {json:{items:array},pairedItem:{item:inputIndex}};});`
    : `if(inputItems.length!==1)throw new Error('Response array extraction requires one input item; got '+inputItems.length);\n${extract}\nreturn [{json:{items:array},pairedItem:{item:0}}];`;
  return `${runtime}\nconst inputItems=$input.all();\n${iteration}`;
}
