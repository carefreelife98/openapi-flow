import { apiLiteralValueSelectionsSchema } from '../../schemas/api-literal-value-selection-schema.js';
import { describeApiLiteralTargets } from './describe-api-literal-targets.js';
import { describeApiLiteralJsonSources } from './describe-api-literal-json-sources.js';
import { locateCompleteApiInputSource } from './locate-complete-api-input-source.js';
import { readApiInputLiteralSource } from './read-api-input-literal-source.js';
import { resolveApiLiteralProposalSources } from './resolve-api-literal-proposal-sources.js';
import { assignApiInputValue } from '../clarification/assign-api-input-value.js';
import { createApiArgumentGenerationContract } from '../../schemas/create-api-argument-generation-contract.js';
import type { ApiArgumentValues } from '../../types/api-arguments.js';
import type {
  ApiLiteralProposalSource,
  ResolveApiLiteralValuesInput,
  ResolvedApiLiteralValues,
} from '../../types/api-input-literal-source.js';

/** Copy selected original values once; never accept a second model-generated value or coerce its type. */
export function resolveApiLiteralValues(
  input: ResolveApiLiteralValuesInput,
): ResolvedApiLiteralValues {
  if (!input.callId?.trim())
    throw new Error('Literal value selection requires callId');
  const selections = apiLiteralValueSelectionsSchema.parse(input.selections);
  const contract = createApiArgumentGenerationContract(input);
  const targets = describeApiLiteralTargets(
    contract,
    selections.map((selection) => selection.targetPointer),
  );
  const catalog = describeApiLiteralJsonSources(input.messages);
  const values: ApiArgumentValues = {};
  const sources: ApiLiteralProposalSource[] = [];
  for (const selection of selections) {
    const message = input.messages.find(
      (entry) => entry.id === selection.messageId,
    );
    if (message === undefined)
      throw new Error(
        `API ${input.callId} literal ${selection.targetPointer} cites unavailable user message ${selection.messageId}`,
      );
    const candidate =
      selection.sourceFormat === 'json'
        ? catalog
            .find((entry) => entry.messageId === selection.messageId)
            ?.json.find((entry) => entry.id === selection.candidateId)
        : undefined;
    if (selection.sourceFormat === 'json' && candidate === undefined)
      throw new Error(
        `API ${input.callId} literal ${selection.targetPointer} has unknown or stale original JSON candidate ${selection.candidateId}`,
      );
    if (
      selection.sourceFormat === 'text' &&
      selection.sourceText.startsWith('"')
    )
      throw new Error(
        `API ${input.callId} literal ${selection.targetPointer} quoted JSON requires a JSON candidate, not a text source`,
      );
    const source: ApiLiteralProposalSource = {
      targetPointer: selection.targetPointer,
      messageId: selection.messageId,
      sourceFormat: selection.sourceFormat,
      sourceText:
        selection.sourceFormat === 'text'
          ? selection.sourceText
          : candidate!.text,
    };
    const matchingMessageIds = input.messages
      .filter(
        (entry) =>
          locateCompleteApiInputSource(entry.text, source.sourceText).length >
          0,
      )
      .map((entry) => entry.id);
    if (!matchingMessageIds.includes(selection.messageId))
      throw new Error(
        `API ${input.callId} literal ${selection.targetPointer} sourceText is absent or is not a complete literal in selected original message ${selection.messageId}. Original messages containing that exact complete sourceText: ${JSON.stringify(matchingMessageIds)}. Select the actual original message; no source has been reassigned.`,
      );
    const parsed = readApiInputLiteralSource({
      ...source,
      text: message.text,
      label: `API ${input.callId} literal ${selection.targetPointer} from message ${selection.messageId}`,
    });
    const target = targets.find(
      (entry) => entry.targetPointer === selection.targetPointer,
    );
    if (target === undefined)
      throw new Error(
        `Literal construction is missing ${selection.targetPointer}`,
      );
    const checkedSource = target.valueSchema.safeParse(parsed.value);
    if (!checkedSource.success)
      throw new Error(
        `API ${input.callId} literal ${selection.targetPointer} source from message ${selection.messageId} (${selection.sourceFormat}, ${Array.isArray(parsed.value) ? 'array' : parsed.value === null ? 'null' : typeof parsed.value}) does not satisfy the OAS target: ${checkedSource.error.message}`,
        { cause: checkedSource.error },
      );
    assignApiInputValue(values, selection.targetPointer, parsed.value, input);
    sources.push(source);
  }
  const checked = contract.valuesSchema.parse(values);
  return {
    values: checked,
    literalSources: resolveApiLiteralProposalSources({
      callId: input.callId,
      values: checked,
      messages: input.messages,
      sources,
    }),
  };
}
