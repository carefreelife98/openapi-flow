import type { ApiLiteralMessageJsonSources } from '@openapi-flow/core';
export interface ApiLiteralSourceChoiceGroup {
  messageId: string;
  targetPointer: string;
  candidates: ApiLiteralMessageJsonSources['json'];
}
