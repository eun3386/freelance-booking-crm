// 사용: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:init:turso [-- --seed]
// 토큰은 이 스크립트를 실행하는 본인 터미널의 환경변수에서만 읽습니다.
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'

const url = process.env.TURSO_DATABASE_URL
if (!url) {
  console.error('TURSO_DATABASE_URL 이 필요합니다. (.env.local 이 아니라 현재 셸의 환경변수를 읽습니다)')
  process.exit(1)
}
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
const run = async (file) => {
  await db.executeMultiple(readFileSync(new URL(`../sqlite/${file}`, import.meta.url), 'utf8'))
  console.log(`✓ ${file}`)
}
await run('schema.sql')
if (process.argv.includes('--seed')) await run('seed.sql')
db.close()
