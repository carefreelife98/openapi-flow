import { z } from 'zod';
import type { WorkflowCapability } from '../types/workflow-plan.js';

/** Official conversion; do not silently discard executable refinements or transforms. */
export function createNativeRuntimeParametersSchema(
  capability: WorkflowCapability,
) {
  return z.toJSONSchema(capability.parametersSchema, {
    io: 'output',
    override(context) {
      const definition = context.zodSchema._zod.def;
      if (['pipe', 'transform', 'custom', 'catch'].includes(definition.type))
        throw new Error(
          `Native runtime parameters ${capability.name} cannot serialize ${definition.type} validation`,
        );
      for (const check of definition.checks ?? []) {
        const kind = check._zod.def.check;
        if (
          ![
            'less_than',
            'greater_than',
            'multiple_of',
            'number_format',
            'min_length',
            'max_length',
            'length_equals',
            'string_format',
          ].includes(kind)
        )
          throw new Error(
            `Native runtime parameters ${capability.name} cannot serialize check ${kind}`,
          );
      }
    },
  });
}
