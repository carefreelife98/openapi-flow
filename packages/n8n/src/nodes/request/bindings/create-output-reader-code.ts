import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { compileStandaloneValidator } from '../../common/validation/compile-standalone-validator.js';

/** Read declared JSON roots without coercion or ambiguous item selection. */
export function createOutputReaderCode(
  sources: N8nOutputBindingSource[],
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
  return `${validator}\nconst sources=${javascriptJsonLiteral(sources)};\nconst responses=Object.create(null);\nconst nativeValues=Object.create(null);\nfor(const source of sources){const items=$(source.nodeName).all();if(items.length!==1)throw new Error('Response '+source.nodeId+' requires an unambiguous single JSON item; got '+items.length+' items');if(!items[0].json||typeof items[0].json!=='object')throw new Error('Missing JSON output '+source.nodeId);if(source.kind==='api-response'){if(!Object.hasOwn(items[0].json,'body'))throw new Error('Missing response body '+source.nodeId);responses[source.nodeId]=items[0].json.body;}else{nativeValues[source.nodeId]=items[0].json;responses[source.nodeId]=items[0].json;}}\n${native.length ? "if(!OpenApiFlowNativeOutputValidator(nativeValues))throw new Error('Native output does not match declared schema: '+JSON.stringify(OpenApiFlowNativeOutputValidator.errors));" : ''}`;
}
