// The firm's three teams, named after their leads' initials. FS is the
// owner's own team — no separate "team_lead_of" needed since the owner
// already has full access everywhere.

export type TeamKey = 'cp' | 'egs' | 'fs';

export interface TeamMeta {
  key: TeamKey;
  label: string;
  leadName: string;
  color: string; // solid swatch, e.g. for a dot/tag
  chip: string;  // tailwind classes for a pill/badge
}

export const TEAMS: TeamMeta[] = [
  { key: 'cp', label: 'Team CP', leadName: 'Chico Palanas', color: '#808000', chip: 'bg-[#808000]/10 text-[#5f5f00]' },
  { key: 'egs', label: 'Team EGS', leadName: 'Elijah Gabriel Sanchez', color: '#1e3a8a', chip: 'bg-blue-900/10 text-blue-900' },
  { key: 'fs', label: 'Team FS', leadName: 'Fretz Suralta', color: '#a3c1e0', chip: 'bg-sky-100 text-sky-700' },
];

export const TEAM_META: Record<TeamKey, TeamMeta> = Object.fromEntries(TEAMS.map(t => [t.key, t])) as Record<TeamKey, TeamMeta>;

export function teamMeta(key: string | null | undefined): TeamMeta | null {
  if (!key) return null;
  return TEAM_META[key as TeamKey] ?? null;
}
