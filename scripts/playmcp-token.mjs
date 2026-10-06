// PlayMCP 연결 토큰을 DB에 넣는다.
//   npm run playmcp:token -- <oneTimeToken>
//
// oneTimeToken 은 https://playmcp.kakao.com/toolbox 에서 '맛집검색'을 도구함에 담고
// 'OpenClaw와 연결'을 누르면 나온다. 1회용이라 교환하면 그 자리에서 죽는다.
//
// 왜 DB인가 — 리프레시 토큰은 갱신할 때마다 값이 바뀌고 이전 값은 죽는다(rotation).
// 환경 변수에만 두면 첫 갱신 직후부터 배포 환경의 값이 쓸모없어진다.
// 서버는 이 테이블의 값을 먼저 보고, 없을 때만 PLAYMCP_REFRESH_TOKEN 을 씨앗으로 쓴다.
import { neon } from '@neondatabase/serverless'

const EXCHANGE_URL = 'https://playmcp.kakao.com/api/v1/auths/otts:exchange'

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error('DATABASE_URL이 없습니다. .env.local 을 확인하거나 `vercel env pull .env.local` 하세요.')
  process.exit(1)
}

const oneTimeToken = process.argv[2]?.trim()
if (!oneTimeToken) {
  console.error('사용법: npm run playmcp:token -- <oneTimeToken>')
  console.error('토큰 발급: https://playmcp.kakao.com/toolbox > OpenClaw와 연결')
  process.exit(1)
}

const response = await fetch(EXCHANGE_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tokenValue: oneTimeToken }),
})

if (!response.ok) {
  console.error(`교환에 실패했습니다 (HTTP ${response.status}). 토큰이 이미 쓰였거나 만료됐습니다.`)
  console.error('https://playmcp.kakao.com/toolbox 에서 새로 발급받아 주세요.')
  process.exit(1)
}

const { accessToken, refreshToken } = await response.json()

const sql = neon(url)
await sql`
  create table if not exists oauth_tokens (
    provider          text primary key,
    access_token      text not null,
    access_expires_at timestamptz not null,
    refresh_token     text not null,
    updated_at        timestamptz not null default now()
  )
`
await sql`
  insert into oauth_tokens (provider, access_token, access_expires_at, refresh_token, updated_at)
  values ('playmcp', ${accessToken.tokenValue}, ${accessToken.expiresAt}, ${refreshToken.tokenValue}, now())
  on conflict (provider) do update set
    access_token = excluded.access_token,
    access_expires_at = excluded.access_expires_at,
    refresh_token = excluded.refresh_token,
    updated_at = now()
`

console.log('PlayMCP 토큰을 저장했습니다.')
console.log(`  액세스 토큰 만료   ${accessToken.expiresAt}`)
console.log(`  리프레시 토큰 만료 ${refreshToken.expiresAt}`)
