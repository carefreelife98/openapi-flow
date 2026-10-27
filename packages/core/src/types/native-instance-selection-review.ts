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
    | { kind: 'unsupported-native-behavior' }
    | { kind: 'native-configuration'; capability: string }
    | { kind: 'api-planning'; callIds: string[] }
    | { kind: 'connection-planning'; nodeIds: string[] }
    | { kind: 'business-decision'; question: string }
  );

export interface NativeInstanceSelectionReviewProposal {
  assessments: Record<string, NativeInstanceGapAssessment>;
}

export interface NativeInstanceSelectionReviewDescription {
  selectionId: string;
  context: NativeInstanceSelection['context'];
  instances: Pick<
    SelectedNativeInstance,
    'id' | 'capability' | 'purpose' | 'runtimeParameters'
  >[];
  gaps: NativeInstanceSelection['gaps'];
}

/** Model judgments are evidence for routing, never approval to delete a gap or mutate the selection. */
export interface NativeInstanceSelectionReview {
  selectionId: string;
  proposal: NativeInstanceSelectionReviewProposal;
  status:
    | 'no-gaps'
    | 'unavailable-native-behavior'
    | 'needs-business-decision'
    | 'needs-reselection';
}

export interface CreateNativeInstanceSelectionReviewInput extends NativeSelectedPlanningInput {
  proposal: NativeInstanceSelectionReviewProposal;
}

export interface ValidateNativeInstanceSelectionReviewInput extends NativeSelectedPlanningInput {
  review: NativeInstanceSelectionReview;
}

export interface NativeInstanceSelectionFeedback {
  selection: NativeInstanceSelection;
  review: NativeInstanceSelectionReview;
  /** Explicit prior attempts from the same immutable source, not accepted plans. */
  previousSelections?: NativeInstanceSelection[];
}

export interface NativeInstanceSelectionFeedbackDescription {
  selectionId: string;
  selectedInstances: NativeInstanceSelectionReviewDescription['instances'];
  reportedGaps: NativeInstanceSelection['gaps'];
  assessments: NativeInstanceSelectionReviewProposal['assessments'];
  previousSelections?: Pick<NativeInstanceSelection, 'id' | 'proposal'>[];
}
