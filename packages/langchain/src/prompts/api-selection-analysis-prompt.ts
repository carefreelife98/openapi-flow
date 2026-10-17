import { operationSelectionPrompt } from './operation-selection-prompt.js';

export const apiSelectionAnalysisPrompt = `${operationSelectionPrompt}
Preserve the scope of the user's actual request. A short lookup request is not authorization to add related checks, extra business API calls or mutations.
When different candidate capabilities could fulfill the same requested role and the supplied request does not distinguish their materially different outcomes, put that role in questions with its alternatives instead of silently selecting one or reporting a missing API.
Do not also select those alternatives as operations for the same unresolved role. Questions concern API meaning only; required request inputs are derived from the selected OAS later by code. Do not ask about n8n node names, ports or connection syntax. Return questions: [] when no consequential choice remains.`;
