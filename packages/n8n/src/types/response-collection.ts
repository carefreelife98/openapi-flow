import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { z } from 'zod';
import type { responseCollectionParametersSchema } from '../schemas/response-collection-schema.js';

export type ResponseCollectionParameters = z.infer<
  typeof responseCollectionParametersSchema
>;
export interface CreateResponseCollectionCapabilityInput {
  materials: ApiBindingMaterial[];
}
