import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import type { CompileValueCollectionFragmentInput } from '../../../types/value-collection.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';

/** The reader validates provenance and contracts; official Aggregate owns collection. */
export function createValueCollectionFragment(
  input: CompileValueCollectionFragmentInput,
): N8nNodeFragment {
  const { planned, position, source, pointer } = input;
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const reader = createOutputReaderCode([source], true);
  const sourceLabel =
    source.kind === 'api-response' ? 'response' : 'native output';
  const extract = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${planned.id}-read-values`,
      name: `Read values ${planned.id}`,
      position,
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `${runtime}\nconst sourceNodeId=${javascriptJsonLiteral(source.nodeId)},pointer=${javascriptJsonLiteral(pointer)};\nreturn $input.all().map((_,inputIndex)=>{${reader}\nconst value=OpenApiFlowRequestRuntime.pointerValue(responses[sourceNodeId],pointer);if(value===undefined)throw new Error(${javascriptJsonLiteral(`Missing ${sourceLabel} pointer `)}+sourceNodeId+pointer);return {json:{value},pairedItem:{item:inputIndex}};});`,
      },
    },
  });
  const aggregate = node({
    type: 'n8n-nodes-base.aggregate',
    version: 1,
    config: {
      id: planned.id,
      name: planned.id,
      position: [position[0] + 220, position[1]],
      parameters: {
        aggregate: 'aggregateIndividualFields',
        fieldsToAggregate: {
          fieldToAggregate: [
            {
              fieldToAggregate: 'value',
              renameField: true,
              outputFieldName: 'items',
            },
          ],
        },
        options: {
          disableDotNotation: true,
          mergeLists: false,
          keepMissing: true,
          includeBinaries: false,
        },
      },
    },
  });
  return {
    nodeId: planned.id,
    bindingSources: [source],
    nodes: [extract, aggregate],
    entry: extract,
    exit: aggregate,
    inputPorts: { main: 0 },
    outputPorts: { main: 0 },
    internalEdges: [
      { from: extract.id, output: 0, to: aggregate.id, input: 0 },
    ],
  };
}
