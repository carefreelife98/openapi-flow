export function assertSerializablePlan(plan: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(plan);
  } catch {
    throw new Error('plan must be JSON-serializable');
  }
  if (!serialized) throw new Error('plan must be a JSON document');
}
