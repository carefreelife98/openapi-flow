import type { NativeNodeParameterProposal } from '../../types/native-node-planning.js';
import type { NativeParameterValuePolicy } from '../../types/native-parameter-value-policy.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import { schemasAtPointer } from '../../bindings/schema-at-pointer.js';
import { createSchemaResourceContext } from '../../bindings/resources/create-schema-resource-context.js';

function matches(pattern: string, pointer: string): boolean {
  if (pattern === '') return true;
  const expected = pattern.split('/');
  const actual = pointer.split('/');
  return (
    expected.length === actual.length &&
    expected.every((part, index) =>
      part === '*'
        ? /^(0|[1-9]\d*)$/u.test(actual[index])
        : part === actual[index],
    )
  );
}

/** A model cannot promote an internal contract or generated copy into a business question. */
export function validateNativeParameterQuestion(
  proposal: NativeNodeParameterProposal,
  policy: NativeParameterValuePolicy | undefined,
  schema: BindingSchema,
): void {
  if (proposal.decision.status !== 'needs-clarification') return;
  if (policy === undefined)
    throw new Error(
      'Native clarification requires capability.parameterValuePolicy; missing value ownership cannot be guessed',
    );
  const resources = createSchemaResourceContext(schema);
  const fields = proposal.decision.fieldPointers;
  if (
    !fields?.length ||
    new Set(fields).size !== fields.length ||
    fields.some(
      (pointer) =>
        schemasAtPointer(resources.root, pointer, resources).length === 0 ||
        !policy.businessInputPaths.some((pattern) =>
          matches(pattern, pointer),
        ) ||
        policy.generatedTextPaths.some((pattern) => matches(pattern, pointer)),
    )
  )
    throw new Error(
      'Native clarification fieldPointers must name distinct capability-declared business inputs; generated text and internal references are not user questions',
    );
}
