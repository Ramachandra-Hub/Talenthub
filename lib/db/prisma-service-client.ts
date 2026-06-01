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
type DbResult<T> = {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
};
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

function isArrayTypeMismatch(message: string): boolean {
  return (
    /type jsonb/i.test(message) ||
    /cannot cast type jsonb/i.test(message) ||
    /malformed array literal/i.test(message) ||
    (/type .*text\[\]/i.test(message) && /json/i.test(message))
  );
}

/** JSON/JSONB columns need string values; TEXT[] columns need native string arrays. */
function serializeInsertValues(
  snake: Row,
  _table?: string,
  mode: 'default' | 'json-arrays' = 'default',
): unknown[] {
  return Object.entries(snake).map(([, v]) => {
    if (v === undefined) return null;
    if (Array.isArray(v)) {
      if (mode === 'json-arrays') return JSON.stringify(v);
      if (v.every((item) => item === null || typeof item === 'string')) {
        return v;
      }
      return JSON.stringify(v);
    }
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return v;
  });
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
  private offsetN: number | null = null;
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
    // PostgREST allows .select() after .update(); must not turn UPDATE into SELECT.
    if (this.op === 'select') {
      this.columns = cols;
      if (opts?.head && opts?.count === 'exact') this.headCount = true;
    }
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

  upsert(row: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.insertRows = Array.isArray(row) ? row : [row];
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

  /** PostgREST-style inclusive range: `.range(0, 9)` → 10 rows starting at 0. */
  range(from: number, to: number) {
    const start = Math.max(0, Math.floor(from));
    const end = Math.max(start, Math.floor(to));
    this.offsetN = start;
    this.limitN = end - start + 1;
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
    if (this.offsetN != null && !this.headCount) sqlText += ` OFFSET ${this.offsetN}`;

    try {
      const rows = await db.unsafe(sqlText, values);
      if (this.headCount) {
        const countRow = Array.isArray(rows) ? rows[0] : undefined;
        return { data: null, error: null, count: countRow?.count ?? 0 } as DbResult<null> & {
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
        let mode: 'default' | 'json-arrays' = 'default';
        let inserted: Row[] | null = null;
        let lastErr: unknown;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          const vals = serializeInsertValues(snake, this.table, mode);
          const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
          const sqlText = `INSERT INTO public.${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders}) RETURNING *`;
          try {
            inserted = (await db.unsafe(sqlText, vals)) as Row[];
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt === 0 && isArrayTypeMismatch(msg)) {
              mode = mode === 'default' ? 'json-arrays' : 'default';
              continue;
            }
            throw err;
          }
        }

        if (lastErr) throw lastErr;
        results.push(...rowsToSnake(inserted ?? []));
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
    const setVals = serializeInsertValues(snake, this.table);
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
    const conflictCols = (this.upsertConflict ?? 'id')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const conflictSql = conflictCols.map(quoteIdent).join(', ');
    const results: Row[] = [];

    try {
      for (const row of this.insertRows) {
        const snake = payloadToSnake(row);
        const cols = Object.keys(snake);
        const vals = serializeInsertValues(snake, this.table);
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const updates = cols
          .filter((c) => !conflictCols.includes(c))
          .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
          .join(', ');
        const sqlText = `INSERT INTO public.${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflictSql}) DO UPDATE SET ${updates} RETURNING *`;
        const inserted = await db.unsafe(sqlText, vals);
        results.push(...rowsToSnake(inserted as Row[]));
      }
      return { data: results, error: null };
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
      const out: DbResult<Row[]> = { data: (res.data ?? []) as Row[], error: null };
      if (res.count != null) out.count = res.count;
      return out;
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
          const email = opts.email.trim().toLowerCase();
          const hash = await bcrypt.hash(opts.password, 12);
          const meta = opts.user_metadata ?? {};
          const data = {
            email,
            passwordHash: hash,
            fullName: (meta.full_name as string) ?? null,
            branch: (meta.department as string) ?? (meta.branch as string) ?? null,
            academicYear: (meta.academic_year as string) ?? (meta.year as string) ?? null,
            rollNumber: (meta.roll_number as string) ?? null,
          };

          try {
            const user = await prisma.user.create({ data });
            return { data: { user: await authUserToClientShape(user) }, error: null };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const duplicate =
              msg.includes('Unique constraint') ||
              msg.includes('unique constraint') ||
              (err as { code?: string }).code === 'P2002';
            if (!duplicate) {
              return { data: { user: null }, error: { message: msg } };
            }
            const existing = await prisma.user.findUnique({ where: { email } });
            if (!existing) {
              return { data: { user: null }, error: { message: msg } };
            }
            const user = await prisma.user.update({
              where: { id: existing.id },
              data,
            });
            return { data: { user: await authUserToClientShape(user) }, error: null };
          }
        },
        async updateUserById(
          id: string,
          patch: {
            email?: string;
            password?: string;
            email_confirm?: boolean;
            user_metadata?: Record<string, unknown>;
          },
        ) {
          const meta = patch.user_metadata ?? {};
          const updateData: {
            email?: string;
            passwordHash?: string;
            fullName?: string | null;
            branch?: string | null;
            academicYear?: string | null;
            rollNumber?: string | null;
          } = {
            fullName: meta.full_name != null ? String(meta.full_name) : undefined,
            branch:
              meta.department != null
                ? String(meta.department)
                : meta.branch != null
                  ? String(meta.branch)
                  : undefined,
            academicYear:
              meta.academic_year != null
                ? String(meta.academic_year)
                : meta.year != null
                  ? String(meta.year)
                  : undefined,
            rollNumber: meta.roll_number != null ? String(meta.roll_number) : undefined,
          };
          if (patch.email?.trim()) {
            updateData.email = patch.email.trim().toLowerCase();
          }
          if (patch.password?.trim()) {
            updateData.passwordHash = await bcrypt.hash(patch.password, 12);
          }
          const user = await prisma.user.update({
            where: { id },
            data: updateData,
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
