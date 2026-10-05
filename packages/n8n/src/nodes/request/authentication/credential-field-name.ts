export function looksLikeCredential(name: string): boolean {
  return /(token|secret|password|authorization|api.?key)/i.test(name);
}
