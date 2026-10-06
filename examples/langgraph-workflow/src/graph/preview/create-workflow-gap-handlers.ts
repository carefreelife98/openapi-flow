import { createN8nWorkflowPreview } from '@openapi-flow/n8n';
import type { WorkflowGapHandlers } from '../../types/workflow-review.js';

export function createWorkflowGapHandlers(): WorkflowGapHandlers {
  return {
    async selection(state, selection) {
      if (!state.catalog) throw new Error('preview requires state.catalog');
      const preview = await createN8nWorkflowPreview({
        id: state.workflowId,
        name: state.workflowName,
        scenario: state.scenario,
        catalog: state.catalog,
        selection,
      });
      return {
        selection,
        preview,
        trace: [...state.trace, 'select', 'review-preview'],
      };
    },
    async bindings(state, bindingPlan) {
      if (!state.catalog || !state.selection)
        throw new Error('preview requires state.catalog and state.selection');
      const preview = await createN8nWorkflowPreview({
        id: state.workflowId,
        name: state.workflowName,
        scenario: state.scenario,
        catalog: state.catalog,
        selection: state.selection,
        issues: bindingPlan.gaps.map((gap) => ({
          stage: 'api-bindings',
          description: gap.description,
        })),
      });
      return {
        bindingPlan,
        preview,
        trace: [...state.trace, 'bindings', 'review-preview'],
      };
    },
    async graph(state, graphPlan) {
      if (!state.catalog || !state.selection)
        throw new Error('preview requires state.catalog and state.selection');
      const preview = await createN8nWorkflowPreview({
        id: state.workflowId,
        name: state.workflowName,
        scenario: state.scenario,
        catalog: state.catalog,
        selection: state.selection,
        issues: graphPlan.gaps.map((gap) => ({
          stage: 'workflow-graph',
          description: gap.description,
        })),
        proposedNativeNodes: graphPlan.nativeNodes.map(
          ({ id, capability }) => ({ id, capability }),
        ),
        proposedEdges: graphPlan.edges,
      });
      return {
        graphPlan,
        preview,
        trace: [...state.trace, 'graph-plan', 'review-preview'],
      };
    },
  };
}
