import type { BindingSchema } from './api-bindings.js';

export type SchemaDeclaredType = string | string[] | undefined;

export interface SchemaResourceLocation {
  reference: string;
  baseUri: string;
}

export interface SchemaResourceContext {
  root: BindingSchema;
  reference: (schema: BindingSchema) => BindingSchema;
  resolve: (schema: BindingSchema) => BindingSchema;
  bundle: (projection: BindingSchema) => BindingSchema;
  /** Compile reachable static schemas into direct named components; preserve all assertions. */
  bundleStaticProjections: (
    projections: Record<string, BindingSchema>,
  ) => StaticSchemaProjectionBundle;
}
export interface StaticSchemaProjectionBundle {
  projections: Record<string, BindingSchema>;
  definitions: Record<string, BindingSchema>;
}
