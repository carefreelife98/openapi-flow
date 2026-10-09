import type { BindingSchema } from './api-bindings.js';

export interface ResponseArrayItemProjection {
  allowsArray: boolean;
  schema: BindingSchema;
}
