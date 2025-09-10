/**
 * Shared narrative utilities for use across server and client
 */

/**
 * Determine the narrative phase based on session count and patterns detected
 * This function is used by both server and client to maintain consistency
 */
export function determineNarrativePhase(
  sessionCount: number,
  patternsDetected: string[]
): 'building' | 'deepening' | 'integrating' {
  if (sessionCount <= 2 && patternsDetected.length < 3) {
    return 'building';
  }
  if (patternsDetected.includes('Thend') || patternsDetected.includes('CYVC')) {
    return 'integrating';
  }
  return 'deepening';
}