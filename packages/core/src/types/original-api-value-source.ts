import type { JsonValue } from './api-arguments.js';
import type { VerifiedWorkflowInput } from './workflow-api-arguments.js';

export type OriginalApiValueSourceResolver = (
  value: JsonValue,
) => VerifiedWorkflowInput['source'] | undefined;
