import { z } from 'zod';
import type { N8nTemplateDeployment } from '../types/workflow-template.js';
import { httpRequestDeploymentOptionsSchema } from './request-deployment-schema.js';

export const n8nTemplateDeploymentsSchema = z
  .array(
    httpRequestDeploymentOptionsSchema.extend({
      documentId: z.string().refine((value) => value.trim().length > 0),
    }),
  )
  .refine(
    (items) =>
      new Set(items.map((item) => item.documentId)).size === items.length,
    {
      message: 'template.deployments must contain distinct documentIds',
    },
  ) satisfies z.ZodType<N8nTemplateDeployment[]>;

export const n8nTemplateInputValuesSchema = z.record(z.string(), z.json());
