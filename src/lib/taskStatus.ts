// Human-readable labels for hub_project_tasks.status — used anywhere status
// shows up in prose (activity log entries, notifications) so "todo" doesn't
// read as one lowercase word ("marked ... as todo") instead of "To Do".
export const TASK_STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  blocked: 'Blocked',
  done: 'Done',
};

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABEL[status] ?? status.replace('_', ' ');
}
