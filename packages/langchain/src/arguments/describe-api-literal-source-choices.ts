import { describeApiLiteralJsonSources } from '@openapi-flow/core';
import type {
  ApiLiteralTargetContract,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type { ApiLiteralSourceChoiceGroup } from '../types/api-literal-source-choices.js';

/** Candidate exposure and runtime assignment share the concrete destination's value contract. */
export function describeApiLiteralSourceChoices(
  messages: WorkflowSourceMessage[],
  targets: ApiLiteralTargetContract[],
): ApiLiteralSourceChoiceGroup[] {
  return describeApiLiteralJsonSources(messages).flatMap((entry) =>
    targets.map((target) => ({
      messageId: entry.messageId,
      targetPointer: target.targetPointer,
      candidates: entry.json.filter(
        (candidate) =>
          target.valueSchema.safeParse(JSON.parse(candidate.text)).success,
      ),
    })),
  );
}
