import { z } from 'zod';

/** Only the map envelope; each source contract is compiled in its own resource scope. */
export function createWorkflowInputValueMapSchema(slotIds: string[]) {
  return z.strictObject(
    Object.fromEntries(slotIds.map((id) => [id, z.json()])),
  );
}
