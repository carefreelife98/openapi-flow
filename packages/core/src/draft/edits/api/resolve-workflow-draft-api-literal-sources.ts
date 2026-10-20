import type { JsonValue } from '../../../types/api-arguments.js';
import type {
  ResolveWorkflowDraftApiLiteralSourcesInput,
  VerifiedWorkflowDraftApiLiteralSource,
} from '../../../types/workflow-draft-api-literal-sources.js';
import { pointerTokens, pointerValue } from '../../../bindings/json-pointer.js';
import { verifyApiInputLiteralSource } from '../../../arguments/sources/verify-api-input-literal-source.js';

/** OAS validation and message existence alone do not establish a literal's origin. */
export function resolveWorkflowDraftApiLiteralSources(
  input: ResolveWorkflowDraftApiLiteralSourcesInput,
): VerifiedWorkflowDraftApiLiteralSource[] {
  const { description, proposal } = input;
  const sources: VerifiedWorkflowDraftApiLiteralSource[] = [];
  const messages = [...description.messages, ...description.backgroundMessages];
  if (proposal.literalSources !== undefined) {
    for (const selection of proposal.literalSources) {
      pointerTokens(selection.targetPointer);
      const label = `API ${description.nodeId} literal ${selection.targetPointer}`;
      if (
        sources.some((source) =>
          overlaps(source.targetPointer, selection.targetPointer),
        )
      )
        throw new Error(`${label} has duplicate or overlapping literalSources`);
      const message = messages.find(
        (entry) => entry.id === selection.messageId,
      );
      if (!message)
        throw new Error(
          `${label} cites unavailable user message ${selection.messageId}`,
        );
      const proposed = pointerValue(proposal.values, selection.targetPointer);
      if (proposed === undefined)
        throw new Error(`${label} source targets an absent proposed value`);
      const parsed = verifyApiInputLiteralSource({
        ...selection,
        text: message.text,
        label,
        value: proposed as JsonValue,
      });
      sources.push({ ...selection, occurrences: parsed.occurrences });
    }
  }
  function check(value: JsonValue, pointer: string): void {
    if (sources.some((source) => isAncestor(source.targetPointer, pointer)))
      return;
    if (
      value !== null &&
      typeof value === 'object' &&
      Object.keys(value).length
    ) {
      for (const [key, child] of Object.entries(value))
        check(
          child,
          `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
        );
      return;
    }
    throw new Error(
      `API ${description.nodeId} literal ${pointer} requires an exact user source in literalSources`,
    );
  }
  for (const [root, value] of Object.entries(proposal.values)) {
    // Empty parameter-location objects contain no request values. Empty body
    // objects/arrays are actual data and still require their own source.
    if (
      root !== 'body' &&
      value !== null &&
      typeof value === 'object' &&
      !Object.keys(value).length
    )
      continue;
    check(value, `/${root}`);
  }
  return sources;
}

function isAncestor(ancestor: string, pointer: string): boolean {
  return (
    ancestor === '' ||
    pointer === ancestor ||
    pointer.startsWith(`${ancestor}/`)
  );
}
function overlaps(left: string, right: string): boolean {
  return isAncestor(left, right) || isAncestor(right, left);
}
