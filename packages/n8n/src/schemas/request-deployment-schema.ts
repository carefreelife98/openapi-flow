import { z } from 'zod';
import type { HttpRequestDeploymentOptions } from '../types/request-deployment.js';
import { originFrom } from '../legacy/workflow/request/base-url.js';

export const httpRequestDeploymentOptionsSchema = z.strictObject({
  baseUrl: z
    .string()
    .superRefine((value, context) => {
      try {
        originFrom(value);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        context.addIssue({
          code: 'custom',
          message: error.message,
        });
      }
    })
    .optional(),
  credentialBindings: z
    .record(
      z.string().min(1),
      z.strictObject({
        id: z.string().refine((value) => value.trim().length > 0),
        name: z.string().refine((value) => value.trim().length > 0),
      }),
    )
    .optional(),
}) satisfies z.ZodType<HttpRequestDeploymentOptions>;
