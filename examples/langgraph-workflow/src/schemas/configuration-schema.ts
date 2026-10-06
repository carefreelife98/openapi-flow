import { z } from 'zod';
import { httpRequestDeploymentOptionsSchema } from '@openapi-flow/n8n';

export const sourceFilesSchema = z
  .array(z.object({ id: z.string().min(1), file: z.string().min(1) }))
  .min(1);
export const deploymentsSchema = z.array(
  z.strictObject({
    ...httpRequestDeploymentOptionsSchema.shape,
    documentId: z.string().min(1),
  }),
);

export const configurationSchema = z.object({
  LLM_BASE_URL: z.url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  LLM_HEADERS_JSON: z
    .string()
    .transform((value) =>
      z.record(z.string(), z.string()).parse(JSON.parse(value)),
    ),
  OAS_SOURCES_JSON: z
    .string()
    .transform((value) => sourceFilesSchema.parse(JSON.parse(value))),
  DEPLOYMENTS_JSON: z
    .string()
    .transform((value) => deploymentsSchema.parse(JSON.parse(value)))
    .optional(),
  SCENARIO: z.string().min(1),
  WORKFLOW_ID: z.string().min(1),
  WORKFLOW_NAME: z.string().min(1),
  OUTPUT_FILE: z.string().min(1),
});
