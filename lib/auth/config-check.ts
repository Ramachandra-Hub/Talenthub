import { getDatabaseSetupErrors } from '@/lib/postgres-url';

/** Surface missing env before auth/DB calls return generic "invalid credentials". */
export function getAuthSetupErrors(): string[] {
  return getDatabaseSetupErrors();
}
