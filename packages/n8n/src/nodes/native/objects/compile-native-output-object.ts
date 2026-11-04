import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import type { CompileNativeOutputObjectInput } from '../../../types/native-output-object.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { resolveNativeRuntimeSource } from '../common/resolve-native-runtime-source.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createMergeAppendCapability } from '../merge-append-capability.js';
import { nativeOutputObjectDefinition } from './native-output-object-definition.js';

export function compileNativeOutputObject(
  input: CompileNativeOutputObjectInput,
): N8nNodeFragment {
  const { planned, parameters, position } = input;
  const sources = input.sources.map((contract) => ({
    ...resolveNativeRuntimeSource({
      binding: { kind: 'compiled' },
      contract,
      compiledSources: input.nativeOutputSources,
      consumerId: planned.id,
    }),
    kind: 'native-json' as const,
  }));
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const reader = createOutputReaderCode(sources);
  const join =
    sources.length > 1
      ? createMergeAppendCapability().compile({
          ...input,
          planned: {
            id: `${planned.id}-join-native-outputs`,
            capability: 'merge-append',
            parameters: { numberInputs: sources.length },
          },
        })
      : undefined;
  const output = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: planned.id,
      name: planned.id,
      position: [position[0] + (join === undefined ? 0 : 220), position[1]],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `${runtime}\n${reader}\nconst fields=${javascriptJsonLiteral(parameters.fields)};\nconst entries=fields.map(field=>{const value=OpenApiFlowRequestRuntime.pointerValue(responses[field.sourceNodeId],field.pointer);if(value===undefined)throw new Error('Missing native pointer '+field.sourceNodeId+field.pointer);return [field.name,value];});\nreturn [{json:Object.fromEntries(entries),pairedItem:$input.all().map((_,item)=>({item}))}];`,
      },
    },
  });
  return {
    nodeId: planned.id,
    nodes: [...(join === undefined ? [] : join.nodes), output],
    entry: join === undefined ? output : join.entry,
    exit: output,
    inputPorts: Object.fromEntries(
      nativeOutputObjectDefinition.inputPorts(parameters).map((p, i) => [p, i]),
    ),
    outputPorts: { main: 0 },
    internalEdges:
      join === undefined
        ? []
        : [
            ...(join.internalEdges === undefined ? [] : join.internalEdges),
            { from: join.exit.id, output: 0, to: output.id, input: 0 },
          ],
    bindingSources: sources,
  };
}
