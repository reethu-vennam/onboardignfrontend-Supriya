import { useState, useEffect } from 'react';
import { authService } from '@/lib/auth-service';

export type UserRole = 'admin' | 'moderator' | 'user';

export const useUserRole = () => {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = authService.getUser();
    if (user?.roles) {
      setRoles(user.roles as UserRole[]);
    } else {
      setRoles([]);
    }
    setLoading(false);
  }, []);

  const hasRole = (role: UserRole): boolean => roles.includes(role);
  const isAdmin = hasRole('admin');
  const isModerator = hasRole('moderator');

  return { roles, loading, hasRole, isAdmin, isModerator };
};
