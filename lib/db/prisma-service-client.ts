/**
 * Prisma-backed RDS service client (RDS / Vercel trial).
 * Implements the subset of PostgREST-style chaining used across app/api and lib.
 */
import postgres from 'postgres';
import { resolvePostgresUrl, stripDriverUnsafeUrlParams } from '@/lib/postgres-url';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import bcrypt from 'bcryptjs';

type Row = Record<string, unknown>;
type DbResult<T> = { data: T; error: { message: string; code?: string } | null };
type Filter =
  | { kind: 'eq'; col: string; val: unknown }
  | { kind: 'neq'; col: string; val: unknown }
  | { kind: 'in'; col: string; vals: unknown[] }
  | { kind: 'not'; col: string; op: string; val: unknown }
  | { kind: 'gte'; col: string; val: unknown }
  | { kind: 'lte'; col: string; val: unknown }
  | { kind: 'contains'; col: string; val: unknown }
  | { kind: 'jsonEq'; path: string; val: unknown };

const TABLE_NAMES = new Set([
  'users',
  'admin_users',
  'test_categories',
  'tests',
  'questions',
  'test_attempts',
  'test_questions',
  'test_sections',
  'exam_schedules',
  'exam_violations',
  'faculty_exam_requests',
  'faculty_profiles',
  'evalora_module_schedules',
  'exam_slot_roster_entries',
  'exam_student_roster',
  'student_active_sessions',
  'student_dashboard_stats',
  'question_tags',
  'question_tag_links',
  'exam_builder_draws',
  'department_groups',
  'department_group_members',
  'rmset_papers',
  'coding_submissions',
  'blog_posts',
]);

let sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  const raw = resolvePostgresUrl();
  if (!raw) throw new Error('DATABASE_URL is not configured');
  const url = stripDriverUnsafeUrlParams(raw);
  if (!sql) {
    const needsSsl =
      url.includes('rds.amazonaws.com') ||
      /[?&]sslmode=require/i.test(url);
    const onVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
    sql = postgres(url, {
      max: onVercel ? 1 : 5,
      prepare: false,
      connect_timeout: 15,
      ...(needsSsl ? { ssl: 'require' as const } : {}),
    });
  }
  return sql;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function rowsToSnake(rows: Row[]): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      out[camelToSnake(k)] = v;
    }
    return out;
  });
}

function payloadToSnake(payload: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k.includes('_') ? k : camelToSnake(k)] = v;
  }
  return out;
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

class TableQuery {
  private readonly table: string;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private columns = '*';
  private filters: Filter[] = [];
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private insertRows: Row[] = [];
  private updatePatch: Row = {};
  private upsertConflict: string | null = null;
  private headCount = false;

  constructor(table: string) {
    if (!TABLE_NAMES.has(table)) {
      throw new Error(`Unknown table for Prisma service client: ${table}`);
    }
    this.table = table;
  }

  select(cols = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this.op = 'select';
    this.columns = cols;
    if (opts?.head && opts?.count === 'exact') this.headCount = true;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: Row) {
    this.op = 'update';
    this.updatePatch = patch;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  upsert(row: Row, opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.insertRows = [row];
    this.upsertConflict = opts?.onConflict ?? 'id';
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ kind: 'eq', col, val });
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push({ kind: 'neq', col, val });
    return this;
  }

  in(col: string, vals: unknown[]) {
    this.filters.push({ kind: 'in', col, vals });
    return this;
  }

  not(col: string, op: string, val: unknown) {
    this.filters.push({ kind: 'not', col, op, val });
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push({ kind: 'gte', col, val });
    return this;
  }

  lte(col: string, val: unknown) {
    this.filters.push({ kind: 'lte', col, val });
    return this;
  }

  contains(col: string, val: unknown) {
    this.filters.push({ kind: 'contains', col, val });
    return this;
  }

  filter(path: string, op: string, val: unknown) {
    this.filters.push({ kind: 'jsonEq', path, val: op === 'eq' ? val : val });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private buildWhere(start = 1): { clause: string; values: unknown[]; next: number } {
    const parts: string[] = [];
    const values: unknown[] = [];
    let i = start;

    for (const f of this.filters) {
      if (f.kind === 'eq') {
        parts.push(`${quoteIdent(f.col)} = $${i++}`);
        values.push(f.val);
      } else if (f.kind === 'neq') {
        parts.push(`${quoteIdent(f.col)} <> $${i++}`);
        values.push(f.val);
      } else if (f.kind === 'in') {
        const vals = f.vals.map(String);
        // UUID/BIGINT columns reject `col = ANY(text[])` — compare as text.
        parts.push(`${quoteIdent(f.col)}::text = ANY($${i++}::text[])`);
        values.push(vals);
      } else if (f.kind === 'not' && f.op === 'is' && f.val === null) {
        parts.push(`${quoteIdent(f.col)} IS NOT NULL`);
      } else if (f.kind === 'gte') {
        parts.push(`${quoteIdent(f.col)} >= $${i++}`);
        values.push(f.val);
      } else if (f.kind === 'lte') {
        parts.push(`${quoteIdent(f.col)} <= $${i++}`);
        values.push(f.val);
      } else if (f.kind === 'contains') {
        parts.push(`${quoteIdent(f.col)}::jsonb @> $${i++}::jsonb`);
        values.push(JSON.stringify(f.val));
      } else if (f.kind === 'jsonEq') {
        const m = f.path.match(/^(.+)->>(.+)$/);
        if (m) {
          parts.push(`${quoteIdent(m[1])}->>'${m[2].replace(/'/g, "''")}' = $${i++}`);
          values.push(String(f.val));
        }
      }
    }

    const clause = parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
    return { clause, values, next: i };
  }

  private async runSelect(): Promise<DbResult<Row[] | Row | null>> {
    const db = getSql();
    const { clause, values } = this.buildWhere(1);
    let sqlText = `SELECT ${this.headCount ? 'COUNT(*)::int AS count' : this.columns} FROM public.${quoteIdent(this.table)}${clause}`;
    if (this.orderBy && !this.headCount) {
      sqlText += ` ORDER BY ${quoteIdent(this.orderBy.col)} ${this.orderBy.ascending ? 'ASC' : 'DESC'}`;
    }
    if (this.limitN != null && !this.headCount) sqlText += ` LIMIT ${this.limitN}`;

    try {
      const rows = await db.unsafe(sqlText, values);
      if (this.headCount) {
        return { data: null, error: null, count: rows[0]?.count ?? 0 } as DbResult<null> & {
          count?: number;
        };
      }
      return { data: rowsToSnake(rows as Row[]), error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async runInsert(): Promise<DbResult<Row[]>> {
    const db = getSql();
    const results: Row[] = [];
    try {
      for (const row of this.insertRows) {
        const snake = payloadToSnake(row);
        const cols = Object.keys(snake);
        const vals = Object.values(snake);
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const sqlText = `INSERT INTO public.${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders}) RETURNING *`;
        const inserted = await db.unsafe(sqlText, vals);
        results.push(...rowsToSnake(inserted as Row[]));
      }
      return { data: results, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async runUpdate(): Promise<DbResult<Row[]>> {
    const db = getSql();
    const snake = payloadToSnake(this.updatePatch);
    const sets = Object.keys(snake);
    if (!sets.length) return { data: [], error: null };
    const setVals = Object.values(snake);
    const setParts = sets.map((c, idx) => `${quoteIdent(c)} = $${idx + 1}`);
    const { clause, values } = this.buildWhere(setVals.length + 1);
    const allVals = [...setVals, ...values];
    const sqlText = `UPDATE public.${quoteIdent(this.table)} SET ${setParts.join(', ')}${clause} RETURNING *`;
    try {
      const rows = await db.unsafe(sqlText, allVals);
      return { data: rowsToSnake(rows as Row[]), error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async runDelete(): Promise<DbResult<Row[]>> {
    const db = getSql();
    const { clause, values } = this.buildWhere(1);
    const sqlText = `DELETE FROM public.${quoteIdent(this.table)}${clause} RETURNING *`;
    try {
      const rows = await db.unsafe(sqlText, values);
      return { data: rowsToSnake(rows as Row[]), error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async runUpsert(): Promise<DbResult<Row[]>> {
    const db = getSql();
    try {
      const snake = payloadToSnake(this.insertRows[0] ?? {});
      const cols = Object.keys(snake);
      const vals = Object.values(snake);
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      const updates = cols
        .filter((c) => c !== this.upsertConflict)
        .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
        .join(', ');
      const sqlText = `INSERT INTO public.${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (${quoteIdent(this.upsertConflict ?? 'id')}) DO UPDATE SET ${updates} RETURNING *`;
      const rows = await db.unsafe(sqlText, vals);
      return { data: rowsToSnake(rows as Row[]), error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  async maybeSingle(): Promise<DbResult<Row | null>> {
    this.limitN = 1;
    const res = await this.execute();
    if (res.error) return { data: null, error: res.error };
    const rows = (res.data ?? []) as Row[];
    return { data: rows[0] ?? null, error: null };
  }

  single(): Promise<DbResult<Row>> {
    return this.maybeSingle() as Promise<DbResult<Row>>;
  }

  then<TResult1 = DbResult<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute(): Promise<DbResult<Row[]>> {
    if (this.op === 'select') {
      const res = await this.runSelect();
      if (res.error) return { data: null, error: res.error };
      return { data: (res.data ?? []) as Row[], error: null };
    }
    if (this.op === 'insert') return this.runInsert();
    if (this.op === 'update') return this.runUpdate();
    if (this.op === 'delete') return this.runDelete();
    if (this.op === 'upsert') return this.runUpsert();
    return { data: null, error: { message: 'Unknown operation' } };
  }
}

async function authUserToClientShape(user: {
  id: string;
  email: string;
  fullName: string | null;
  branch: string | null;
  academicYear: string | null;
  rollNumber: string | null;
  passwordHash: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    user_metadata: {
      full_name: user.fullName,
      department: user.branch,
      academic_year: user.academicYear,
      roll_number: user.rollNumber,
      role: 'student',
    },
  };
}

export function createPrismaServiceClient() {
  return {
    from(table: string) {
      return new TableQuery(table);
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          const user = await prisma.user.findUnique({ where: { id } });
          if (!user) return { data: { user: null }, error: { message: 'User not found' } };
          return {
            data: { user: await authUserToClientShape(user) },
            error: null,
          };
        },
        async listUsers(opts?: { page?: number; perPage?: number }) {
          const page = opts?.page ?? 1;
          const perPage = opts?.perPage ?? 200;
          const users = await prisma.user.findMany({
            skip: (page - 1) * perPage,
            take: perPage,
            orderBy: { createdAt: 'desc' },
          });
          return {
            data: {
              users: await Promise.all(users.map((u) => authUserToClientShape(u))),
            },
            error: null,
          };
        },
        async createUser(opts: {
          email: string;
          password: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
        }) {
          const hash = await bcrypt.hash(opts.password, 12);
          const meta = opts.user_metadata ?? {};
          const user = await prisma.user.create({
            data: {
              email: opts.email.trim().toLowerCase(),
              passwordHash: hash,
              fullName: (meta.full_name as string) ?? null,
              branch: (meta.department as string) ?? null,
              academicYear: (meta.academic_year as string) ?? null,
              rollNumber: (meta.roll_number as string) ?? null,
            },
          });
          return { data: { user: await authUserToClientShape(user) }, error: null };
        },
        async updateUserById(id: string, patch: { user_metadata?: Record<string, unknown> }) {
          const meta = patch.user_metadata ?? {};
          const user = await prisma.user.update({
            where: { id },
            data: {
              fullName: meta.full_name != null ? String(meta.full_name) : undefined,
              branch: meta.department != null ? String(meta.department) : undefined,
              academicYear: meta.academic_year != null ? String(meta.academic_year) : undefined,
              rollNumber: meta.roll_number != null ? String(meta.roll_number) : undefined,
            },
          });
          return { data: { user: await authUserToClientShape(user) }, error: null };
        },
        async deleteUser(id: string) {
          await prisma.user.delete({ where: { id } }).catch(() => undefined);
          return { data: {}, error: null };
        },
      },
      async getUser(token: string) {
        const { decode } = await import('next-auth/jwt');
        const secret = process.env.AUTH_SECRET;
        if (!secret) return { data: { user: null }, error: { message: 'AUTH_SECRET missing' } };
        const payload = await decode({ token, secret, salt: '' });
        const sub = payload?.sub;
        if (!sub) return { data: { user: null }, error: null };
        const user = await prisma.user.findUnique({ where: { id: String(sub) } });
        if (!user) return { data: { user: null }, error: null };
        return { data: { user: await authUserToClientShape(user) }, error: null };
      },
      async signInWithPassword(opts: { email: string; password: string }) {
        const user = await prisma.user.findUnique({
          where: { email: opts.email.trim().toLowerCase() },
        });
        if (!user?.passwordHash) {
          return { data: { user: null }, error: { message: 'Invalid credentials' } };
        }
        const ok = await verifyPassword(opts.password, user.passwordHash);
        if (!ok) return { data: { user: null }, error: { message: 'Invalid credentials' } };
        return { data: { user: await authUserToClientShape(user) }, error: null };
      },
      async signUp() {
        return { data: { user: null }, error: { message: 'Use /api/auth/signup on AWS stack' } };
      },
      async signOut() {
        return { error: null };
      },
      async updateUser() {
        return { data: { user: null }, error: null };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
    },
  };
}

export type PrismaServiceClient = ReturnType<typeof createPrismaServiceClient>;
