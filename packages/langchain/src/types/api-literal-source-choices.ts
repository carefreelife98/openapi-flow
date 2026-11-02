import type { ApiLiteralMessageJsonSources } from '@openapi-flow/core';
export interface ApiLiteralSourceChoiceGroup {
  messageId: string;
  inputRoot: string;
  descendants: boolean;
  candidates: ApiLiteralMessageJsonSources['json'];
}
