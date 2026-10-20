import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { compileNativeOutputValidators } from './compile-native-output-validators.js';
import { compileSourceResponseValidators } from './compile-source-response-validators.js';
import { createOutputItemReaderCode } from './create-output-item-reader-code.js';

/** Read declared JSON roots without coercion or ambiguous item selection. */
export function createOutputReaderCode(
  sources: N8nOutputBindingSource[],
  linked = false,
  singletonNodeIds: string[] = [],
): string {
  const declarations = sources.map((source, index) => ({
    nodeId: source.nodeId,
    nodeName: source.nodeName,
    kind: source.kind,
    singleton: singletonNodeIds.includes(source.nodeId),
    validator: source.kind === 'native-json' || source.operation ? index : null,
  }));
  const responseValidators = sources
    .map((source, index) =>
      source.kind === 'api-response' && source.operation
        ? `OpenApiFlowResponseValidator${index}`
        : 'null',
    )
    .join(',');
  const nativeValidators = sources
    .map((source, index) =>
      source.kind === 'native-json'
        ? `OpenApiFlowNativeOutputValidator${index}`
        : 'null',
    )
    .join(',');
  const reader = createOutputItemReaderCode(linked);
  return `${compileNativeOutputValidators(sources)}\n${compileSourceResponseValidators(sources)}\nconst sources=${javascriptJsonLiteral(declarations)};\nconst validators=[${responseValidators}];\nconst nativeValidators=[${nativeValidators}];\nconst responses=Object.create(null);\nfor(const source of sources){${reader}if(!item||!item.json||typeof item.json!=='object')throw new Error('Missing JSON output '+source.nodeId);if(source.kind==='api-response'){if(source.validator!==null){const validate=validators[source.validator];if(!validate(OpenApiFlowRequestRuntime.apiResponseValidationValue(item.json)))throw new Error('Response '+source.nodeId+' does not match its OAS contract: '+JSON.stringify(validate.errors));}if(!Object.hasOwn(item.json,'body'))throw new Error('Missing response body '+source.nodeId);responses[source.nodeId]=item.json.body;}else{const validate=nativeValidators[source.validator];if(!validate(item.json))throw new Error('Native output does not match declared schema: '+JSON.stringify(validate.errors)+' (source '+source.nodeId+')');responses[source.nodeId]=item.json;}}`;
}
