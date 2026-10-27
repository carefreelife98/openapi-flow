import type {
  NativeSelectedPlanningInput,
  NativeInstanceSelection,
  SelectedNativeInstance,
} from './native-node-planning.js';

export interface NativeInstanceGapReviewEvidence {
  sourceQuote: string;
  reason: string;
}

export type NativeInstanceGapAssessment = NativeInstanceGapReviewEvidence &
  (
    | { kind: 'not-required' }
    | { kind: 'unsupported-native-behavior' }
    | { kind: 'native-configuration'; capability: string }
    | { kind: 'api-planning'; callIds: string[] }
    | { kind: 'connection-planning'; nodeIds: string[] }
    | { kind: 'business-decision'; question: string }
  );

export type NativeInstanceRoleAssessment = NativeInstanceGapReviewEvidence &
  (
    | { kind: 'required' }
    | { kind: 'not-required' }
    | { kind: 'business-decision'; question: string }
  );

export type NativeInstanceSelectionCoverageAssessment =
  NativeInstanceGapReviewEvidence &
    (
      | { kind: 'covered' }
      | { kind: 'needs-reselection' }
      | { kind: 'unsupported-native-behavior' }
      | { kind: 'business-decision'; question: string }
    );

export interface NativeInstanceSelectionReviewOptions {
  /** Opt into reviewing every selected role, including selections with no gaps. */
  reviewInstances?: true;
}

export type NativeInstanceSelectionReviewInput = NativeSelectedPlanningInput &
  NativeInstanceSelectionReviewOptions;

export interface NativeInstanceSelectionReviewProposal {
  assessments: Record<string, NativeInstanceGapAssessment>;
  /** Required only when reviewInstances is explicitly enabled. */
  instanceAssessments?: Record<string, NativeInstanceRoleAssessment>;
  /** Full review also examines omitted required processing, including an empty selection. */
  coverageAssessment?: NativeInstanceSelectionCoverageAssessment;
}

export interface NativeInstanceSelectionReviewDescription extends NativeInstanceSelectionReviewOptions {
  selectionId: string;
  context: NativeInstanceSelection['context'];
  instances: Pick<
    SelectedNativeInstance,
    'id' | 'capability' | 'purpose' | 'runtimeParameters'
  >[];
  gaps: NativeInstanceSelection['gaps'];
}

/** Model judgments are evidence for routing, never approval to delete a gap or mutate the selection. */
export interface NativeInstanceSelectionReview extends NativeInstanceSelectionReviewOptions {
  selectionId: string;
  proposal: NativeInstanceSelectionReviewProposal;
  status:
    | 'no-gaps'
    | 'unavailable-native-behavior'
    | 'needs-business-decision'
    | 'needs-reselection';
}

export interface CreateNativeInstanceSelectionReviewInput extends NativeInstanceSelectionReviewInput {
  proposal: NativeInstanceSelectionReviewProposal;
}

export interface ValidateNativeInstanceSelectionReviewInput extends NativeInstanceSelectionReviewInput {
  review: NativeInstanceSelectionReview;
}

export interface NativeInstanceSelectionFeedback {
  selection: NativeInstanceSelection;
  review: NativeInstanceSelectionReview;
  /** Explicit prior attempts from the same immutable source, not accepted plans. */
  previousSelections?: NativeInstanceSelection[];
}

export interface NativeInstanceSelectionFeedbackDescription extends NativeInstanceSelectionReviewOptions {
  selectionId: string;
  selectedInstances: NativeInstanceSelectionReviewDescription['instances'];
  reportedGaps: NativeInstanceSelection['gaps'];
  assessments: NativeInstanceSelectionReviewProposal['assessments'];
  instanceAssessments?: NativeInstanceSelectionReviewProposal['instanceAssessments'];
  coverageAssessment?: NativeInstanceSelectionReviewProposal['coverageAssessment'];
  previousSelections?: Pick<NativeInstanceSelection, 'id' | 'proposal'>[];
}
