import type { NodeTypeDescription } from '@n8n/workflow-sdk';
import type { N8nOfficialNodePortDefinition } from '../../../types/official-node-planning.js';

export function describeOfficialNodePorts(
  ports: NodeTypeDescription['inputs'],
  source: string,
): N8nOfficialNodePortDefinition {
  if (typeof ports === 'string') {
    if (!ports.trim()) throw new Error(`${source} is an empty port expression`);
    return { status: 'dynamic-expression', expression: ports };
  }
  if (!Array.isArray(ports))
    throw new Error(`${source} must declare ports or a dynamic expression`);
  for (const [index, port] of ports.entries()) {
    const type = typeof port === 'string' ? port : port?.type;
    if (typeof type !== 'string' || !type.trim())
      throw new Error(`${source}[${index}] is missing its port type`);
  }
  return { status: 'declared', ports: structuredClone(ports) };
}
