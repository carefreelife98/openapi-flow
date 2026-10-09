import type { z } from 'zod';
import type { ApiBindingMaterial, JsonValue } from '@openapi-flow/core';
import type {
  N8nNativeOutputSource,
  N8nOutputBindingSource,
} from './output-binding-source.js';
import type { itemJoinParametersSchema } from '../schemas/item-join-schema.js';

export type ItemJoinParameters = z.infer<typeof itemJoinParametersSchema>;
export interface CreateItemJoinCapabilityInput {
  materials: ApiBindingMaterial[];
  scopes: N8nNativeOutputSource[];
}
export interface CreateItemJoinReaderCodeInput {
  scope: N8nNativeOutputSource;
  sourceCallId: string;
  sources: N8nOutputBindingSource[];
}
export interface ItemJoinRow {
  scopeIndex: number;
  sourceCallId: string;
  response: JsonValue;
}
export interface ItemJoinInputItem {
  json: ItemJoinRow;
}
export interface JoinApiItemsInput {
  items: ItemJoinInputItem[];
  sourceCallIds: string[];
}
export interface ItemJoinValues {
  responses: Record<string, JsonValue>;
}
export interface ItemJoinOutputItem {
  json: ItemJoinValues;
  pairedItem: ItemJoinPair[];
}
export interface ItemJoinPair {
  item: number;
}
export interface ItemJoinGroup {
  values: Map<string, JsonValue>;
  inputIndexes: number[];
}
