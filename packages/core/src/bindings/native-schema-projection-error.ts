import type { NativeSchemaProjectionStep } from '../types/native-schema-projection.js';

/** Preserve the failed projection step so adapters can retain their own diagnostics. */
export class NativeSchemaProjectionError extends Error {
  readonly step: NativeSchemaProjectionStep;
  constructor(nodeId: string, step: NativeSchemaProjectionStep) {
    super(`native output ${nodeId} has no declared array`);
    this.name = 'NativeSchemaProjectionError';
    this.step = structuredClone(step);
  }
}
