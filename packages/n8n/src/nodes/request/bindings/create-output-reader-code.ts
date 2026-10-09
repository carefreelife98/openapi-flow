import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { compileStandaloneValidator } from '../../common/validation/compile-standalone-validator.js';
import { compileSourceResponseValidators } from './compile-source-response-validators.js';

/** Read declared JSON roots without coercion or ambiguous item selection. */
export function createOutputReaderCode(
  sources: N8nOutputBindingSource[],
  linked = false,
): string {
  const native = sources.filter((source) => source.kind === 'native-json');
  const validator = native.length
    ? compileStandaloneValidator({
        schema: {
          type: 'object',
          properties: Object.fromEntries(
            native.map((source) => [source.nodeId, source.schema]),
          ),
          required: native.map((source) => source.nodeId),
          additionalProperties: false,
        },
        globalName: 'OpenApiFlowNativeOutputValidator',
      })
    : '';
  const declarations = sources.map((source, index) => ({
    nodeId: source.nodeId,
    nodeName: source.nodeName,
    kind: source.kind,
    validator:
      source.kind === 'api-response' && source.operation ? index : null,
  }));
  const responseValidators = sources
    .map((source, index) =>
      source.kind === 'api-response' && source.operation
        ? `OpenApiFlowResponseValidator${index}`
        : 'null',
    )
    .join(',');
  const reader = linked
    ? 'const item=$(source.nodeName).itemMatching(inputIndex);'
    : "const items=$(source.nodeName).all();if(items.length!==1)throw new Error('Response '+source.nodeId+' requires an unambiguous single JSON item; got '+items.length+' items');const item=items[0];";
  return `${validator}\n${compileSourceResponseValidators(sources)}\nconst sources=${javascriptJsonLiteral(declarations)};\nconst validators=[${responseValidators}];\nconst responses=Object.create(null);\nconst nativeValues=Object.create(null);\nfor(const source of sources){${reader}if(!item||!item.json||typeof item.json!=='object')throw new Error('Missing JSON output '+source.nodeId);if(source.kind==='api-response'){if(source.validator!==null){const validate=validators[source.validator];if(!validate(OpenApiFlowRequestRuntime.apiResponseValidationValue(item.json)))throw new Error('Response '+source.nodeId+' does not match its OAS contract: '+JSON.stringify(validate.errors));}if(!Object.hasOwn(item.json,'body'))throw new Error('Missing response body '+source.nodeId);responses[source.nodeId]=item.json.body;}else{nativeValues[source.nodeId]=item.json;responses[source.nodeId]=item.json;}}\n${native.length ? "if(!OpenApiFlowNativeOutputValidator(nativeValues))throw new Error('Native output does not match declared schema: '+JSON.stringify(OpenApiFlowNativeOutputValidator.errors));" : ''}`;
}
