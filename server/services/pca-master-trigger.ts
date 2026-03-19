export type PCAMasterTriggerCategory = 'initial' | 'substantive' | 'transition' | 'skip';

export interface PCAMasterTriggerInput {
  exchangeCount: number;
  significantMomentCount: number;
  structuredPatternCount: number;
  structuredHistoricalCount: number;
  structuredConnectionCount: number;
  finalCSSStage: string;
  finalCSSStageConfidence: number;
  hasRecentAnalysis: boolean;
}

export interface PCAMasterTriggerDecision {
  shouldRun: boolean;
  reason: string;
  category: PCAMasterTriggerCategory;
}

const MIN_EXCHANGES_FOR_SUBSTANTIVE = 6;
const MIN_SIGNIFICANT_MOMENTS = 2;
const MIN_STRUCTURED_ITEMS = 3;
const MIN_EXCHANGES_FOR_INITIAL = 4;
const STAGE_TRANSITION_CONFIDENCE = 0.7;
const NON_INITIAL_STAGES = new Set(['focus_bind', 'suspension', 'gesture_toward', 'completion', 'terminal']);

export function shouldRunPCAMasterAnalysis(input: PCAMasterTriggerInput): PCAMasterTriggerDecision {
  const structuredItemCount =
    input.structuredPatternCount +
    input.structuredHistoricalCount +
    input.structuredConnectionCount;

  const hasSubstantiveVolume =
    input.exchangeCount >= MIN_EXCHANGES_FOR_SUBSTANTIVE ||
    input.significantMomentCount >= MIN_SIGNIFICANT_MOMENTS ||
    structuredItemCount >= MIN_STRUCTURED_ITEMS;

  if (input.exchangeCount < MIN_EXCHANGES_FOR_INITIAL && structuredItemCount === 0 && input.significantMomentCount === 0) {
    return {
      shouldRun: false,
      category: 'skip',
      reason: 'session too short with no meaningful material'
    };
  }

  if (!input.hasRecentAnalysis && input.exchangeCount >= MIN_EXCHANGES_FOR_INITIAL && hasSubstantiveVolume) {
    return {
      shouldRun: true,
      category: 'initial',
      reason: 'no recent pca_master_analysis and session is substantive'
    };
  }

  if (hasSubstantiveVolume && (input.significantMomentCount > 0 || structuredItemCount >= MIN_STRUCTURED_ITEMS)) {
    return {
      shouldRun: true,
      category: 'substantive',
      reason: 'substantive session with significant moments or structured material'
    };
  }

  if (
    NON_INITIAL_STAGES.has(input.finalCSSStage) &&
    input.finalCSSStageConfidence >= STAGE_TRANSITION_CONFIDENCE &&
    input.exchangeCount >= MIN_EXCHANGES_FOR_INITIAL
  ) {
    return {
      shouldRun: true,
      category: 'transition',
      reason: `css stage transitioned to ${input.finalCSSStage} with confidence ${input.finalCSSStageConfidence.toFixed(2)}`
    };
  }

  if (input.hasRecentAnalysis) {
    return {
      shouldRun: false,
      category: 'skip',
      reason: 'recent pca_master_analysis exists and current session is low-signal'
    };
  }

  return {
    shouldRun: false,
    category: 'skip',
    reason: 'no trigger rule matched'
  };
}
