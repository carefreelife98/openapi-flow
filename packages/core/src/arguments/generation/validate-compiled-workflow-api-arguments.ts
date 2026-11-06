import { isDeepStrictEqual } from 'node:util';
import type {
  ValidateCompiledWorkflowApiArgumentsInput,
  CompiledWorkflowApiArguments,
} from '../../types/workflow-api-arguments.js';
import { compileWorkflowApiArguments } from './compile-workflow-api-arguments.js';
import { describeApiArgumentEnumContext } from '../enum/describe-api-argument-enum-context.js';
import { resolveApiArgumentEnumInterpretation } from '../enum/resolve-api-argument-enum-interpretation.js';

/** Revalidate a checkpoint against the independent current contracts, including enum evidence. */
export function validateCompiledWorkflowApiArguments(
  input: ValidateCompiledWorkflowApiArgumentsInput,
): CompiledWorkflowApiArguments {
  const checked = compileWorkflowApiArguments({
    ...input,
    plan: input.result.plan,
  });
  for (const [index, literal] of checked.arguments.entries()) {
    const candidate = input.result.arguments.find(
      (entry) => entry.callId === literal.callId,
    );
    if (candidate === undefined)
      throw new Error(
        `Compiled workflow arguments are missing ${literal.callId}`,
      );
    if (candidate.enumInterpretation === undefined) continue;
    const call = input.calls.find((entry) => entry.callId === literal.callId);
    if (
      call === undefined ||
      literal.literalGeneration === undefined ||
      literal.literalSources === undefined ||
      literal.requestedInputs === undefined
    )
      throw new Error(
        'Compiled workflow enum evidence has no current literal contract',
      );
    const record = literal.literalGeneration;
    const material = {
      ...call,
      scenario: input.scenario,
      literalSourceMessages: input.catalog.messages,
      proposal: {
        values:
          record.kind === 'proposed-literals' ? record.proposedValues : {},
      },
      literalSources: literal.literalSources,
      requestedInputs: literal.requestedInputs,
    };
    const inventory = describeApiArgumentEnumContext(material);
    const enumIntentInputs = inventory.requirements
      .filter((requirement) =>
        literal.requestedInputs!.some(
          (pointer) =>
            requirement.targetPointer === pointer ||
            requirement.targetPointer.startsWith(pointer + '/'),
        ),
      )
      .map((requirement) => requirement.targetPointer);
    if (!enumIntentInputs.length)
      throw new Error(
        'Compiled workflow enum evidence targets no requested OAS enum',
      );
    const resolved = resolveApiArgumentEnumInterpretation({
      ...material,
      enumIntentInputs,
      analysis: candidate.enumInterpretation.analysis,
    });
    checked.arguments[index] = {
      ...literal,
      values: resolved.values,
      unresolvedInputs: resolved.unresolvedInputs,
      enumInterpretation: resolved.interpretation,
    };
  }
  if (!isDeepStrictEqual(checked, input.result))
    throw new Error(
      'Compiled workflow arguments changed or belong to different input contracts',
    );
  return checked;
}
