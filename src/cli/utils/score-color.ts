/**
 * Shared score-to-color helper for CLI tables and summaries.
 */
export type ScoreColor = (value: string) => string;

export type ScorePalette = {
  green: ScoreColor;
  yellow: ScoreColor;
  red: ScoreColor;
};

export type ScoreColorThresholds = {
  high: number;
  medium: number;
};

const DEFAULT_SCORE_THRESHOLDS: ScoreColorThresholds = {
  high: 80,
  medium: 60,
};

/**
 * Pick color palette based on a numeric score.
 */
export function getScoreColor(
  score: number,
  colors: ScorePalette,
  thresholds: ScoreColorThresholds = DEFAULT_SCORE_THRESHOLDS,
): ScoreColor {
  if (score >= thresholds.high) return colors.green;
  if (score >= thresholds.medium) return colors.yellow;
  return colors.red;
}

