import type { z } from 'zod';
import type { configurationSchema } from '../schemas/configuration-schema.js';
export type ExampleConfiguration = z.infer<typeof configurationSchema>;
