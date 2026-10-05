import { createHash } from 'node:crypto';

export function workflowId(baseUrl: string, plan: unknown): string {
  return (
    'openapi-flow-' +
    createHash('sha256')
      .update(JSON.stringify({ baseUrl, plan }))
      .digest('hex')
      .slice(0, 16)
  );
}
