import type { z } from 'zod';
import type { workflowConnectionEvidenceReferenceSchema } from '../schemas/workflow-connection-evidence-schema.js';
import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionWorkingGraph,
} from './workflow-connection-session.js';

export type WorkflowConnectionEvidenceReference = z.infer<
  typeof workflowConnectionEvidenceReferenceSchema
>;
/** Private, code-derived current facts. These are not a public event payload or a semantic proof. */
export interface WorkflowConnectionEvidence {
  id: string;
  kind:
    | 'requirement'
    | 'api-operation'
    | 'api-arguments'
    | 'api-response-contract'
    | 'native-material'
    | 'material-inventory'
    | 'graph';
  nodeId?: string;
  factId?: string;
  value: unknown;
}
export interface DescribeWorkflowConnectionEvidenceInput {
  source: WorkflowConnectionSessionSource;
  graph: Pick<
    WorkflowConnectionWorkingGraph,
    'edges' | 'rootNodeIds' | 'terminals'
  >;
}
