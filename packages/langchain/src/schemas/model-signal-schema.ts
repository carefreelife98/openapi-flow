import { z } from 'zod';

/** Runtime invocation configuration only; never included in model data or source fingerprints. */
export const modelSignalSchema = z.instanceof(AbortSignal).optional();
