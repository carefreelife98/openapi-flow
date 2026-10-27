import { readFileSync } from 'node:fs';
import type { CreateKeyJoinReaderCodeInput } from '../../../types/api-response-key-join.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';

export function createKeyJoinReaderCode(
  input: CreateKeyJoinReaderCodeInput,
): string {
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const read = createOutputReaderCode([input.source], true);
  return `${runtime}
const selection=${javascriptJsonLiteral(input.selection)};
const side=${javascriptJsonLiteral(input.side)};
const missingKeys=${javascriptJsonLiteral(input.missingKeys)};
return $input.all().flatMap((_,inputIndex)=>{
${read}
const rows=OpenApiFlowRequestRuntime.pointerValue(responses[selection.sourceNodeId],selection.pointer);
if(!Array.isArray(rows))throw new Error('Key join '+side+' requires an array at '+selection.sourceNodeId+selection.pointer);
return rows.map((row,rowIndex)=>{
const key=OpenApiFlowRequestRuntime.pointerValue(row,selection.keyPointer);
if(key===undefined&&missingKeys==='error')throw new Error('Key join '+side+' missing key at '+selection.sourceNodeId+selection.pointer+'/'+rowIndex+selection.keyPointer);
const json={};
if(key!==undefined)json.key=key;
json[side]=row;
return {json,pairedItem:{item:inputIndex}};
});
});`;
}
