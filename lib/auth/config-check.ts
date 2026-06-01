import { getDatabaseSetupErrors } from '@/lib/postgres-url';

/** Surface missing env before auth/DB calls return generic "invalid credentials". */
export function getAuthSetupErrors(): string[] {
  const errors: string[] = [];

  if (!process.env.AUTH_SECRET?.trim()) {
    errors.push(
      'AUTH_SECRET is not set. Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  errors.push(...getDatabaseSetupErrors());

  return errors;
}
