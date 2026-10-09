import { readFileSync } from 'node:fs';
import type { CreateItemJoinReaderCodeInput } from '../../../types/item-join.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';

export function createItemJoinReaderCode({
  scope,
  sourceCallId,
  sources,
}: CreateItemJoinReaderCodeInput): string {
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const read = createOutputReaderCode(sources, true);
  return `${runtime}
const scopeName=${javascriptJsonLiteral(scope.nodeName)};
const sourceCallId=${javascriptJsonLiteral(sourceCallId)};
const scopeItems=$(scopeName).all();
return $input.all().map((_,inputIndex)=>{
${read}
const ancestor=$(scopeName).itemMatching(inputIndex);
const matches=scopeItems.flatMap((item,index)=>item===ancestor?[index]:[]);
if(matches.length!==1)throw new Error('Item join '+sourceCallId+': scope ancestry must identify exactly one item in the current scope execution');
return {json:{scopeIndex:matches[0],sourceCallId,response:responses[sourceCallId]},pairedItem:{item:inputIndex}};
});`;
}
