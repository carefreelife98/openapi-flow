import type { BindingSchema } from './api-bindings.js';

export interface ArrayItemProjection {
  allowsArray: boolean;
  schema: BindingSchema;
}
