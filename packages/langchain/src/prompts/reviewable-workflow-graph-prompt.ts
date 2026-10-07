import { workflowGraphPrompt } from './workflow-graph-prompt.js';

export const reviewableWorkflowGraphPrompt = `${workflowGraphPrompt}
This is a reviewable plan. Supplied gaps and already blocked API calls are explicit main/main placeholder nodes, not API response producers. Include them in the internal DAG at scenario-grounded locations. Never bypass or silently drop a requirement. The library preserves the internal connections but disconnects the trigger when any gap remains.
Use every supplied API call and every supplied gap ID. Do not regenerate supplied gaps. additionalGaps represent only newly discovered unmet requirements and have stable logical node IDs. Do not emit starts.
If a ready API needs unavailable data from a gap or blocked call, list it in blockedCalls with its causal gapIds. Never invent a parameter value, response schema, response binding or substitute API. Do not repeat already blocked calls in blockedCalls. Fields fixed by the context are omitted from the output schema; do not emit absent fields.
Only ready, unblocked API calls provide actual response references. Native nodes that require unavailable data must be represented as additionalGaps instead of a fabricated condition/assertion. Gap nodes have main input and output; their implementation always fails if executed.
An unplaced requirement may remain an independent gap root if the scenario does not establish an ordering; never guess a dependency from array order.`;
