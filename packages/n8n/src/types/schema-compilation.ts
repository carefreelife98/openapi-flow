import type { BindingSchema } from '@openapi-flow/core';

export interface CompileStandaloneValidatorInput {
  schema: BindingSchema;
  globalName: string;
}
