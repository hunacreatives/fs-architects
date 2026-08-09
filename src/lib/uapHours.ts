// UAP (United Architects of the Philippines) Field of Practice hour
// tracking — junior architects/students need 3,840 logged hours across
// these 6 categories before they can sit the board exam.

export type UapCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface UapCategoryDef {
  key: UapCategory;
  label: string;
  percent: number;
  requiredHours: number;
}

export const UAP_CATEGORIES: UapCategoryDef[] = [
  { key: 'A', label: 'Architectural Designing / Drafting, Structural Conceptualization, Planning, etc.', percent: 30, requiredHours: 1152 },
  { key: 'B', label: 'Contract Documents, Specifications, BOM, Cost Estimates, Bidding Documents, etc.', percent: 25, requiredHours: 960 },
  { key: 'C', label: 'Field Superintendence, Project Management / Administration, etc.', percent: 15, requiredHours: 576 },
  { key: 'D', label: 'Feasibility Studies, Project Promotion, Pre-Design, etc.', percent: 10, requiredHours: 384 },
  { key: 'E', label: 'Architectural Layout of MEPF / Utilities, Lighting, Acoustics & Allied Fields', percent: 10, requiredHours: 384 },
  { key: 'F', label: 'Architectural Interiors / Space Planning, Restoration and Ancillary Services', percent: 10, requiredHours: 384 },
];

export const UAP_TOTAL_REQUIRED_HOURS = 3840;

// Default category suggested from a project's current Phase. Schematic
// Design and Design Development each cover more than one type of work
// (Interiors and MEPF respectively can come up during either), so these
// are just the common-case default — always overridable per task.
export const PHASE_TO_UAP_CATEGORY: Record<string, UapCategory> = {
  'Pre-Design': 'D',
  'Schematic Design': 'A',
  'Design Development': 'A',
  'Construction Documents': 'B',
  'Permitting': 'B',
  'Bidding/Procurement': 'B',
  'Construction Administration': 'C',
  'Post-Construction/Closeout': 'C',
};

export function resolveUapCategory(taskOverride: string | null | undefined, projectPhase: string | null | undefined): UapCategory | null {
  if (taskOverride) return taskOverride as UapCategory;
  if (!projectPhase) return null;
  return PHASE_TO_UAP_CATEGORY[projectPhase] ?? null;
}
