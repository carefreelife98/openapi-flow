export function originFrom(baseUrl: string): URL {
  if (typeof baseUrl !== 'string' || !URL.canParse(baseUrl)) {
    throw new Error('baseUrl must be an absolute HTTP(S) URL');
  }
  const url = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'baseUrl must be an HTTP(S) URL without credentials, query, or fragment',
    );
  }
  return url;
}
