export interface TaskAssigneeShape {
  assigned_to?: string | null;
  assignee_id?: string | null;
  assignee_ids?: string[] | null;
}

export interface ChecklistAssignmentItem {
  id: string;
  text: string;
  done: boolean;
  detail?: string;
  assignee_id?: string | null;
}

function uniq(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function getTaskAssigneeIds(task: TaskAssigneeShape | null | undefined) {
  if (!task) return [] as string[];
  if (Array.isArray(task.assignee_ids) && task.assignee_ids.length > 0) {
    return uniq(task.assignee_ids);
  }
  return uniq([task.assigned_to ?? task.assignee_id ?? '']);
}

export function getPrimaryTaskAssigneeId(task: TaskAssigneeShape | null | undefined) {
  return getTaskAssigneeIds(task)[0] ?? null;
}

export function normalizeTaskAssigneePayload(assigneeIds: string[]) {
  const normalized = uniq(assigneeIds);
  return {
    assignee_ids: normalized.length ? normalized : null,
    assigned_to: normalized[0] ?? null,
  };
}

export function sameAssigneeIds(a: string[], b: string[]) {
  const left = uniq(a).sort();
  const right = uniq(b).sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeChecklistItems(items: ChecklistAssignmentItem[] | null | undefined) {
  return (items ?? []).map((item) => ({
    ...item,
    detail: item.detail ?? '',
    assignee_id: item.assignee_id ?? null,
  }));
}
