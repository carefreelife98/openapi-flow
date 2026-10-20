import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createNativeRuntimeParameterMaterializations } from '@openapi-flow/core';
import type { PrependNativeParameterGuardInput } from '../../../types/native-runtime-parameters.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { compileStandaloneValidator } from '../../common/validation/compile-standalone-validator.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';

/** Validate the unchanged declared parameter object again immediately before the native node. */
export function prependNativeParameterGuard({
  input,
  capability,
  fragment,
}: PrependNativeParameterGuardInput): N8nNodeFragment {
  const configuration = input.runtimeInput;
  if (
    !configuration ||
    typeof configuration.inputNodeName !== 'string' ||
    !configuration.inputNodeName.trim() ||
    !Number.isSafeInteger(configuration.revision) ||
    configuration.revision < 0
  )
    throw new Error(
      `node ${input.planned.id}: runtime parameters require an explicit template input source and revision`,
    );
  const [materialization] = createNativeRuntimeParameterMaterializations({
    nativeNodes: [input.planned],
    capabilities: [capability],
  });
  if (
    !materialization ||
    !isDeepStrictEqual(materialization, configuration.materialization)
  )
    throw new Error(
      `node ${input.planned.id}: runtime parameter slot differs from its original capability contract`,
    );
  const validator = compileStandaloneValidator({
    schema: materialization.schema,
    globalName: 'OpenApiFlowNativeParametersValidator',
  });
  const runtime = readFileSync(
    new URL('./native-input-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const read = `const configurations=$(${javascriptJsonLiteral(configuration.inputNodeName)}).all();if(configurations.length!==1)throw new Error('Native runtime input requires exactly one configuration item');const payload=configurations[0].json;if(!payload||payload.revision!==${configuration.revision})throw new Error('Missing or stale native input revision');if(!payload.values||typeof payload.values!=='object')throw new Error('Missing native runtime input values');const parameters=OpenApiFlowNativeInputRuntime.materializeNativeRuntimeParameters(${javascriptJsonLiteral(materialization)},payload.values);if(!OpenApiFlowNativeParametersValidator(parameters))throw new Error('Native runtime input violates original schema for '+${javascriptJsonLiteral(materialization.nodeId)}+': '+JSON.stringify(OpenApiFlowNativeParametersValidator.errors));`;
  const guard = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${input.planned.id}-parameters`,
      name: `Parameters ${input.planned.id}`,
      position: [input.position[0] - 220, input.position[1]],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `${runtime}\n${validator}\n${read}\nreturn $input.all().map((_,index)=>({json:parameters,pairedItem:{item:index}}));`,
      },
    },
  });
  return {
    ...fragment,
    entry: guard,
    nodes: [guard, ...fragment.nodes],
    internalEdges: [
      { from: guard.id, output: 0, to: fragment.entry.id, input: 0 },
      ...(fragment.internalEdges === undefined ? [] : fragment.internalEdges),
    ],
  };
}
