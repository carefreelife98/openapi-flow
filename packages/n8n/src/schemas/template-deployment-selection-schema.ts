import { z } from 'zod';
import type { SelectN8nTemplateDeploymentsInput } from '../types/workflow-template.js';
import { n8nTemplateDeploymentsSchema } from './workflow-template-schema.js';

const documentIds = z
  .array(z.string().refine((id) => id.trim().length > 0))
  .refine((ids) => new Set(ids).size === ids.length);
export const templateDeploymentSelectionSchema: z.ZodType<SelectN8nTemplateDeploymentsInput> =
  z.strictObject({
    deployments: n8nTemplateDeploymentsSchema,
    availableDocumentIds: documentIds,
    selectedDocumentIds: documentIds,
  });
