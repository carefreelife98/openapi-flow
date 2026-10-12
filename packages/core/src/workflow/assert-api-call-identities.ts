export function assertApiCallIdentities(apiCallIds: string[]): void {
  if (
    !Array.isArray(apiCallIds) ||
    apiCallIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(apiCallIds).size !== apiCallIds.length
  )
    throw new Error(
      'planning.apiCallIds must contain unique non-empty call IDs',
    );
}
