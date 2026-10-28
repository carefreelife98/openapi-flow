export interface WorkflowRequiredPrecedence {
  before: string;
  after: string;
  kind: 'data-reference' | 'declared-dependency';
  /** If present, availability is required on this input route only. */
  inputPort?: string;
}
