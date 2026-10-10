import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { compileStandaloneValidator } from '../../common/validation/compile-standalone-validator.js';

/** Every producer retains its own schema resource root and reference scope. */
export function compileNativeOutputValidators(
  sources: N8nOutputBindingSource[],
): string {
  return sources
    .map((source, index) =>
      source.kind === 'native-json'
        ? compileStandaloneValidator({
            schema: source.schema,
            globalName: `OpenApiFlowNativeOutputValidator${index}`,
          })
        : '',
    )
    .join('\n');
}
