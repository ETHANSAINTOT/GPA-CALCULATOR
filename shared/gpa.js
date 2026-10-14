// Shared by the server (source of truth) and the browser (live preview).

export const GRADE_POINTS = Object.freeze({ A: 4, B: 3, C: 2, D: 1, E: 0 });
export const GRADES = Object.keys(GRADE_POINTS);

/**
 * new GPA = (base GPA × base credits + Σ grade points × UE credits) / (base credits + Σ UE credits)
 *
 * An E weighs in the GPA (0 points over its credits) but its credits are not acquired.
 */
export function computeSummary(baseGpa, baseCredits, ues) {
  let points = baseGpa * baseCredits;
  let weightedCredits = baseCredits;
  let acquiredCredits = baseCredits;

  for (const ue of ues) {
    points += GRADE_POINTS[ue.grade] * ue.credits;
    weightedCredits += ue.credits;
    if (ue.grade !== 'E') acquiredCredits += ue.credits;
  }

  return {
    gpa: weightedCredits > 0 ? points / weightedCredits : baseGpa,
    credits: acquiredCredits,
  };
}

export function formatGpa(gpa) {
  return (Math.round((gpa + Number.EPSILON) * 100) / 100).toFixed(2);
}
