// Shared project-type taxonomy — replaces the old free-text "service" field.
// A project's type (not to be confused with hub_projects.project_type, the
// separate client/internal/retainer workflow classification) drives its
// system-generated code (FS-{TYPE}-{YY}-{NNN}, generated DB-side) and its
// color/label everywhere it's shown.

export const PROJECT_TYPES: { code: string; label: string }[] = [
  { code: 'RES', label: 'Residential' },
  { code: 'COM', label: 'Commercial' },
  { code: 'IND', label: 'Industrial' },
  { code: 'INST', label: 'Institutional' },
  { code: 'AGR', label: 'Agricultural' },
  { code: 'MIX', label: 'Mixed-Use' },
  { code: 'REN', label: 'Renovation / Alteration' },
  { code: 'ADD', label: 'Addition / Expansion' },
  { code: 'AI', label: 'Architectural Interiors' },
  { code: 'SITE', label: 'Site Development / Landscape' },
];

const LABEL_BY_CODE: Record<string, string> = Object.fromEntries(PROJECT_TYPES.map(t => [t.code, t.label]));

export function getProjectTypeLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return LABEL_BY_CODE[code] ?? code;
}

const palette: Record<string, { from: string; to: string }> = {
  RES: { from: '#f59e0b', to: '#d97706' },
  COM: { from: '#38bdf8', to: '#0284c7' },
  IND: { from: '#64748b', to: '#475569' },
  INST: { from: '#818cf8', to: '#4f46e5' },
  AGR: { from: '#34d399', to: '#059669' },
  MIX: { from: '#f472b6', to: '#db2777' },
  REN: { from: '#2dd4bf', to: '#0d9488' },
  ADD: { from: '#22d3ee', to: '#0891b2' },
  AI: { from: '#c084fc', to: '#9333ea' },
  SITE: { from: '#a3e635', to: '#65a30d' },
};
const fallbackPalette = { from: '#9ca3af', to: '#6b7280' };

export function getProjectTypePalette(code: string | null | undefined): { from: string; to: string } {
  return (code && palette[code]) || fallbackPalette;
}

const cfg: Record<string, { badge: string }> = {
  RES: { badge: 'bg-amber-50 text-amber-700' },
  COM: { badge: 'bg-sky-50 text-sky-700' },
  IND: { badge: 'bg-slate-100 text-slate-600' },
  INST: { badge: 'bg-indigo-50 text-indigo-700' },
  AGR: { badge: 'bg-emerald-50 text-emerald-700' },
  MIX: { badge: 'bg-pink-50 text-pink-700' },
  REN: { badge: 'bg-teal-50 text-teal-700' },
  ADD: { badge: 'bg-cyan-50 text-cyan-700' },
  AI: { badge: 'bg-purple-50 text-purple-700' },
  SITE: { badge: 'bg-lime-50 text-lime-700' },
};
const fallbackCfg = { badge: 'bg-gray-50 text-gray-500' };

export function getProjectTypeCfg(code: string | null | undefined): { badge: string } {
  return (code && cfg[code]) || fallbackCfg;
}
