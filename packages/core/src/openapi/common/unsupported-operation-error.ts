export class UnsupportedOperationError extends Error {
  readonly operationRef: string;

  constructor(operationRef: string, message: string) {
    super(message);
    this.name = 'UnsupportedOperationError';
    this.operationRef = operationRef;
  }
}
