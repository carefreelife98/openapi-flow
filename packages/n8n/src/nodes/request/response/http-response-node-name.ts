/** One compiler-owned exit identity, shared by producer and reference mapping. */
export function httpResponseNodeName(callId: string): string {
  return `Request ${callId}`;
}
