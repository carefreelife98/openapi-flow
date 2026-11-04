import type { WorkflowConnectionVerificationContract } from '../../../types/workflow-connection-session.js';

/** Descriptions of the implemented checks, not model-defined proof obligations. */
export const connectionVerificationContract: WorkflowConnectionVerificationContract =
  {
    target: 'generated-workflow-configuration',
    basis: 'supplied-operation-contracts-and-registered-native-implementations',
    checks: {
      'operation-set':
        'Exact complete configured API call instance set. Trust the supplied operation contracts; do not audit hidden handlers.',
      'material-value':
        'Type-strict equality of an actual scalar CONFIGURATION field, including native source IDs, response-pointer strings, comparison operators and error text. These settings declare runtime rules; no live response value is needed to check them.',
      'material-shape':
        'Container type and exact array/object size at a current configuration path. Combine with leaf equality to exclude extra entries.',
      precedence:
        'Every target execution route must include its required predecessor.',
      route:
        'Every target execution route must traverse the named predecessor output.',
      independent:
        'No execution dependency path between the supplied branches.',
      join: 'Every route into the declared all-input join has completed every required producer.',
    },
  };
