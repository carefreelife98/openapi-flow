/** A missing system-owned contract is not a missing user value. */
export class NativeParameterMaterialUnavailableError extends Error {
  readonly nodeId: string;
  constructor(nodeId: string, message: string) {
    super(
      `Native instance ${nodeId}: missing system-owned material: ${message}`,
    );
    this.name = 'NativeParameterMaterialUnavailableError';
    this.nodeId = nodeId;
  }
}
