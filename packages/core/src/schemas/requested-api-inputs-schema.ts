import { z } from 'zod';

/** Scenario-required presence is metadata, not a change to OAS requiredness. */
export const requestedApiInputsSchema = z
  .array(z.string().regex(/^\/(?:[^~]|~[01])*$/u))
  .refine((pointers) => new Set(pointers).size === pointers.length, {
    message: 'requestedInputs requires distinct non-root JSON Pointers',
  });
