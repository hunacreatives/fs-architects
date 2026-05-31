import { UserRole } from '@/lib/types';

export const ADMIN_ROLES: UserRole[] = ['owner', 'admin', 'hr'];

export function isAdminRole(role?: string | null): role is UserRole {
  return !!role && ADMIN_ROLES.includes(role as UserRole);
}

export function getHubHomePath(role?: string | null) {
  return isAdminRole(role) ? '/hub/admin/dashboard' : '/hub/contractor/dashboard';
}
