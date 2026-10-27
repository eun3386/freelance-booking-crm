import { fileRepo } from './repo-file'
import { neonRepo } from './repo-neon'
import { supabaseRepo } from './repo-supabase'
import { tursoRepo } from './repo-turso'
import type { Repo } from './types'

const REPOS = { turso: tursoRepo, neon: neonRepo, supabase: supabaseRepo, file: fileRepo }
export type Backend = keyof typeof REPOS

// 선택 순서: DB_BACKEND(명시) → TURSO_DATABASE_URL → DATABASE_URL(Neon) → SUPABASE_* → 로컬 파일
// 여러 DB 환경변수가 함께 있을 때 DB_BACKEND 로 강제할 수 있음
const forced = process.env.DB_BACKEND as Backend | undefined
export const backend: Backend =
  forced && forced in REPOS
    ? forced
    : process.env.TURSO_DATABASE_URL
      ? 'turso'
      : process.env.DATABASE_URL
        ? 'neon'
        : process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
          ? 'supabase'
          : 'file'

export const repo: Repo = REPOS[backend]
