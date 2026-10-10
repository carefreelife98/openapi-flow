export type SchemaJsonValue =
  null | boolean | number | string | SchemaJsonValue[] | SchemaJsonObject;
export interface SchemaJsonObject {
  [key: string]: SchemaJsonValue;
}
