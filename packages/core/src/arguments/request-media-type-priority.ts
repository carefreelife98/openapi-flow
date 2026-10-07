/** Product preference, not an OpenAPI restriction or transport support check. */
export function requestMediaTypePriority(mediaType: string): number {
  if (mediaType === 'application/json') return 0;
  if (mediaType === 'application/x-www-form-urlencoded') return 1;
  return mediaType.includes('*') ? 3 : 2;
}
