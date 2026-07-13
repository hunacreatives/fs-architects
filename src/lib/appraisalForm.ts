// FS Architects Appraisal Form (rev1) — factors, rubric, and scoring.
// Mirrors the paper form: 8 factors × 3 criteria rated 1–5. A factor's score
// is the average of its criteria; Total Score is the sum of the 8 factor
// scores (max 40); Final Rating % = Total × 2.5; Performance Level = Total / 8
// matched to the rubric bands below.

export interface AppraisalFactor {
  key: string;
  label: string;
  criteria: string[];
}

export const APPRAISAL_FACTORS: AppraisalFactor[] = [
  {
    key: 'job_knowledge',
    label: 'Job Knowledge',
    criteria: [
      'Has thorough knowledge and skills of fundamentals, operational and procedural processes pertinent to work performance.',
      'Demonstrates understanding of his/her function and manifests proficiency or competence in all phases of the job.',
      'Provides technical information, contributes new ideas, and understands the flow of command in the organization.',
    ],
  },
  {
    key: 'productivity',
    label: 'Productivity and Professional Output',
    criteria: [
      'Works fast, turns out a large amount of work, and completes it ahead of time/deadline.',
      'Accomplishes work in order of priority and delivers more output than expected.',
      'Maintains composure and effectiveness under pressure and changing conditions.',
    ],
  },
  {
    key: 'quality_of_work',
    label: 'Quality of Work',
    criteria: [
      'Works thoroughly and accurately; systematic and complete.',
      'Conforms to the standards and specifications of assigned tasks.',
      'Output is neat, with a low error rate and minimum waste of time and resources.',
    ],
  },
  {
    key: 'interpersonal_relations',
    label: 'Interpersonal Relations',
    criteria: [
      'Maintains effective lines of communication among employees and establishes positive and productive working relationships with workmates.',
      'Open to suggestions and constructive criticism; cooperative.',
      "Shows respect for others' ability, judgement and feelings, and responds to direction of superiors.",
    ],
  },
  {
    key: 'policy_compliance',
    label: 'Policy Compliance',
    criteria: [
      'Shows consistency and willingness to follow company policies, rules and procedures.',
      'Clean performance record; no violations or disciplinary actions.',
      'Perfect attendance; punctual in observing work hours, break periods, appointments and meeting/activity schedules.',
    ],
  },
  {
    key: 'leadership_ability',
    label: 'Leadership Ability',
    criteria: [
      'Sets a good example in work habits and high standards of performance; performs the job with minimum direction and supervision.',
      'Demonstrates maturity and soundness in decisions, solutions and recommendations; able to identify alternative approaches.',
      'Displays innovative ideas and resourcefulness.',
    ],
  },
  {
    key: 'growth_development',
    label: 'Growth and Development',
    criteria: [
      'Takes on additional work or unfamiliar work-related concerns.',
      'Actively participates in meetings and activities.',
      'Strives to improve productivity and is open to coaching and counseling.',
    ],
  },
  {
    key: 'work_behavior_values',
    label: 'Work Behavior and Values',
    criteria: [
      'Follows company policies, procedures, and workplace guidelines.',
      'Demonstrates professionalism and respect in the workplace.',
      'Takes accountability for responsibilities and commitments.',
    ],
  },
];

export interface PerformanceLevelBand {
  level: number;
  label: string;
  range: string;
  description: string;
}

export const PERFORMANCE_LEVEL_BANDS: PerformanceLevelBand[] = [
  {
    level: 5,
    label: 'Excellent Performance',
    range: 'Perfect 5',
    description:
      "The employee's work performance is clearly and consistently superior to the standards required for the position. His/her high level of competence is easily recognized by others in related areas as well as outside of the employee's own group or projects assigned. He/she is successful in unusual and adverse situations, meets extraordinary work challenges with little or no guidance. Results significantly exceeded performance standards over a sustained period.",
  },
  {
    level: 4,
    label: 'Above Average Performance',
    range: '4 - 4.9',
    description:
      'The employee exceeds most requirements of the position and tasks. He/she demonstrates a level of accomplishment that goes beyond reasonable and demanding standards, particularly in key knowledge, skills and abilities. He/she is characterized by high results and demonstrated planning and execution of all routine functions and most major functions with minimal guidance.',
  },
  {
    level: 3,
    label: 'Average/Acceptable Performance',
    range: '3 - 3.9',
    description:
      'The employee demonstrates a level of accomplishments that clearly fulfills expectations. He/she shows good, solid and consistent performance. He/she has demonstrated ability to execute and control routine functions and several major functions with occasional guidance.',
  },
  {
    level: 2,
    label: 'Below Average Performance',
    range: '2 - 2.9',
    description:
      "The employee at times shows inconsistency in meeting the job requirements and is unable to complete routine tasks. The employee's performance shows deficiencies that require correction. The employee's work often needs revision or adjustments to meet a minimal level and requires assistance from supervisor and/or peers. He/she needs unusually close supervision to meet job requirements.",
  },
  {
    level: 1,
    label: 'Poor Performance',
    range: 'Below 2',
    description:
      'The employee performance demonstrates a level of accomplishments that is below the standards of performance and does not meet job requirements. He/she shows an inconsistent level of achievements and requires frequent close direction, monitoring and guidance than normally expected for routine functions. The employee demonstrates little or no contribution to organizational goals and consistently fails to meet work objectives.',
  },
];

export interface FactorRating {
  levels: (number | null)[];
  remarks: string;
}

export type AppraisalRatings = Record<string, FactorRating>;

export interface Appraisal {
  id: string;
  employee_id: string;
  rater_id: string | null;
  job_title: string | null;
  period_covered: string;
  month_appraised: string;
  status: 'draft' | 'awaiting_employee' | 'awaiting_hr' | 'completed';
  ratings: AppraisalRatings;
  total_score: number | null;
  final_rating_pct: number | null;
  performance_level: number | null;
  comments_recommendations: string | null;
  one_on_one_at: string | null;
  decision: 'regularization' | 'end_of_contract' | null;
  below_satisfactory_action: 'monitoring' | 'pip' | null;
  employee_comments: string | null;
  employee_acknowledged_at: string | null;
  hr_reviewer_id: string | null;
  hr_comments: string | null;
  hr_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  employee?: { full_name: string; avatar_url: string | null; department?: string | null };
  rater?: { full_name: string } | null;
  hr_reviewer?: { full_name: string } | null;
}

export function emptyRatings(): AppraisalRatings {
  const out: AppraisalRatings = {};
  for (const f of APPRAISAL_FACTORS) {
    out[f.key] = { levels: f.criteria.map(() => null), remarks: '' };
  }
  return out;
}

export function factorScore(rating: FactorRating | undefined): number | null {
  const vals = (rating?.levels ?? []).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeScores(ratings: AppraisalRatings): {
  totalScore: number | null;
  finalPct: number | null;
  performanceLevel: number | null;
  band: PerformanceLevelBand | null;
  complete: boolean;
} {
  const scores = APPRAISAL_FACTORS.map(f => factorScore(ratings[f.key]));
  const complete = APPRAISAL_FACTORS.every(f =>
    (ratings[f.key]?.levels ?? []).length === f.criteria.length &&
    (ratings[f.key]?.levels ?? []).every(v => v != null)
  );
  if (scores.some(s => s == null)) return { totalScore: null, finalPct: null, performanceLevel: null, band: null, complete };
  const total = (scores as number[]).reduce((a, b) => a + b, 0);
  const pl = total / APPRAISAL_FACTORS.length;
  return {
    totalScore: total,
    finalPct: total * 2.5,
    performanceLevel: pl,
    band: bandForLevel(pl),
    complete,
  };
}

export function bandForLevel(pl: number): PerformanceLevelBand {
  if (pl >= 5) return PERFORMANCE_LEVEL_BANDS[0];
  if (pl >= 4) return PERFORMANCE_LEVEL_BANDS[1];
  if (pl >= 3) return PERFORMANCE_LEVEL_BANDS[2];
  if (pl >= 2) return PERFORMANCE_LEVEL_BANDS[3];
  return PERFORMANCE_LEVEL_BANDS[4];
}

// Factors averaging below 3 are "below satisfactory" — the form then requires
// choosing Monitoring or a Performance Improvement Plan.
export function belowSatisfactoryFactors(ratings: AppraisalRatings): AppraisalFactor[] {
  return APPRAISAL_FACTORS.filter(f => {
    const s = factorScore(ratings[f.key]);
    return s != null && s < 3;
  });
}

export const APPRAISAL_STATUS_META: Record<Appraisal['status'], { label: string; chip: string }> = {
  draft: { label: 'Draft', chip: 'bg-gray-100 text-gray-600' },
  awaiting_employee: { label: 'Awaiting Employee', chip: 'bg-sky-100 text-sky-700' },
  awaiting_hr: { label: 'Awaiting HR Review', chip: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', chip: 'bg-emerald-100 text-emerald-700' },
};
