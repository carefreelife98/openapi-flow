import type { ApiArgumentValues, JsonValue } from './api-arguments.js';

/** Presence required by the workflow request, separately from OAS requiredness. */
export interface RequestedApiInputPresenceInput {
  source: string;
  rootPointer: string;
  value: ApiArgumentValues | JsonValue | undefined;
  requestedInputs?: string[];
}
