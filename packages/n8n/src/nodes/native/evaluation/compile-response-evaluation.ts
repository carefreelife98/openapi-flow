import { node } from '@n8n/workflow-sdk';
import type { CompileResponseEvaluationInput } from '../../../types/response-evaluation.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createComparisonSourceReader } from '../comparisons/create-comparison-input-reader.js';
import { createResponseEvaluationCode } from './create-response-evaluation-code.js';
import { createNativeFragment } from '../common/create-native-fragment.js';

export function compileResponseEvaluation(
  input: CompileResponseEvaluationInput,
): N8nNodeFragment {
  const { planned, parameters, position, linked } = input;
  const reader = createComparisonSourceReader({
    ...input,
    nodeId: planned.id,
    references: parameters.checks.map((check) => check.source),
    linked,
  });
  const evaluate = createResponseEvaluationCode(parameters, reader.code);
  const execute = `(()=>{${evaluate}})()`;
  const code = linked
    ? `return $input.all().map((_,inputIndex)=>({json:${execute},pairedItem:{item:inputIndex}}));`
    : `const value=${execute};return [{json:value,pairedItem:$input.all().map((_,item)=>({item}))}];`;
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
    preservesInputItems: linked,
    bindingSources: reader.bindingSources,
  };
}
