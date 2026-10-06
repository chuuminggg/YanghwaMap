import { db } from './db.js'
import { InvalidUpstreamKeyError, MissingUpstreamKeyError, readKey, UpstreamError } from './upstream.js'

/**
 * PlayMCP(카카오) MCP 게이트웨이 클라이언트.
 *
 * '추천' 탭이 쓰는 맛집검색 서버(playmcp.kakao.com/mcp/200)는 공개 주소가 없다.
 * 게이트웨이(https://playmcp.kakao.com/mcp)를 거쳐야만 부를 수 있고, 게이트웨이는
 * PlayMCP 계정의 OAuth 액세스 토큰을 요구한다. 그래서 브라우저가 직접 부를 수 없다 —
 * 토큰이 노출되면 남의 계정 쿼터를 그대로 쓰게 된다.
 *
 * 토큰 수명이 둘로 나뉜다는 점이 이 파일의 대부분을 차지한다.
 *   액세스 토큰   12시간. 만료되면 리프레시 토큰으로 다시 받는다
 *   리프레시 토큰 3개월. 갱신할 때마다 값이 바뀌고(rotation) 이전 값은 죽는다
 *
 * 값이 바뀐다는 게 핵심이다. 환경 변수에만 두면 첫 갱신 직후부터 환경 변수의 값은
 * 쓸모가 없어지고, 다음 콜드 스타트에서 죽은 토큰을 들고 시작하게 된다.
 * 그래서 환경 변수는 '씨앗'으로만 쓰고 이후 최신 토큰은 DB에 둔다.
 */

const GATEWAY_URL = 'https://playmcp.kakao.com/mcp'
const TOKEN_URL = 'https://playauth.kakao.com/playmcp/oauth2/token'

/** PlayMCP 연결 가이드가 공개한 클라이언트 ID. 비밀값이 아니라 공개 클라이언트다. */
const CLIENT_ID = 'HElMUWdVoroTsrXxezeTSemg8gXzzCKWARb5MJux8gY'

export const PLAYMCP_SOURCE = 'PlayMCP 맛집검색'

const REISSUE_GUIDE =
  'https://playmcp.kakao.com/toolbox 에서 "OpenClaw와 연결"로 새 oneTimeToken을 발급받아 ' +
  'https://playmcp.kakao.com/api/v1/auths/otts:exchange 로 교환한 뒤, ' +
  '받은 refreshToken을 PLAYMCP_REFRESH_TOKEN에 넣어 주세요. (docs/api-keys.md 참고)'

const RATE_LIMIT_MESSAGE =
  'PlayMCP 호출 한도에 걸렸습니다(초당 3회). 잠시 후 다시 시도해 주세요.'

/** 게이트웨이는 빠르다(보통 1초 안쪽). 오래 매달리는 건 원본이 멈춘 것이므로 일찍 끊는다. */
const TIMEOUT_MS = 8_000

type Tokens = {
  accessToken: string
  /** epoch ms */
  accessExpiresAt: number
  refreshToken: string
}

/** 같은 서버리스 인스턴스가 재사용될 때 DB를 매번 읽지 않도록 들고 있는다. */
let cached: Tokens | null = null
let tableReady = false

/**
 * 토큰 보관 테이블을 필요할 때 만든다.
 *
 * db-setup 에도 같은 정의가 있지만, 이 기능만 나중에 켜는 사람이 db:setup 을 다시 돌리지 않아도
 * 동작해야 한다. `if not exists` 라 여러 번 불려도 안전하다.
 */
async function ensureTable() {
  if (tableReady) return
  await db().query(`
    create table if not exists oauth_tokens (
      provider          text primary key,
      access_token      text not null,
      access_expires_at timestamptz not null,
      refresh_token     text not null,
      updated_at        timestamptz not null default now()
    )
  `)
  tableReady = true
}

async function readStored(): Promise<Tokens | null> {
  await ensureTable()
  const rows = (await db().query(
    'select access_token, access_expires_at, refresh_token from oauth_tokens where provider = $1',
    ['playmcp'],
  )) as { access_token: string; access_expires_at: Date | string; refresh_token: string }[]

  const row = rows[0]
  if (!row) return null
  return {
    accessToken: row.access_token,
    accessExpiresAt: new Date(row.access_expires_at).getTime(),
    refreshToken: row.refresh_token,
  }
}

async function store(tokens: Tokens) {
  await ensureTable()
  await db().query(
    `insert into oauth_tokens (provider, access_token, access_expires_at, refresh_token, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (provider) do update set
       access_token = excluded.access_token,
       access_expires_at = excluded.access_expires_at,
       refresh_token = excluded.refresh_token,
       updated_at = now()`,
    ['playmcp', tokens.accessToken, new Date(tokens.accessExpiresAt).toISOString(), tokens.refreshToken],
  )
  cached = tokens
}

/**
 * 리프레시 토큰으로 새 토큰 한 쌍을 받는다.
 *
 * 실패는 두 갈래다. 400(invalid_grant)은 토큰이 죽은 것이라 사람이 다시 발급해야 하고,
 * 그 밖의 실패는 인증 서버 쪽 사정이라 잠시 후 다시 하면 된다. 둘을 섞으면
 * 화면이 '다시 시도'만 반복하게 된다.
 */
async function refresh(refreshToken: string): Promise<Tokens> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
      signal: controller.signal,
    })
  } catch {
    throw new UpstreamError(PLAYMCP_SOURCE, 'PlayMCP 인증 서버에 연결하지 못했습니다.')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 400 || response.status === 401) {
    cached = null
    throw new InvalidUpstreamKeyError('PLAYMCP_REFRESH_TOKEN', `토큰이 만료됐거나 이미 갱신돼 죽었습니다. ${REISSUE_GUIDE}`)
  }
  if (!response.ok) {
    throw new UpstreamError(PLAYMCP_SOURCE, `PlayMCP 인증 서버가 HTTP ${response.status}를 돌려줬습니다.`)
  }

  const body = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!body.access_token || !body.refresh_token) {
    throw new UpstreamError(PLAYMCP_SOURCE, 'PlayMCP 인증 서버 응답에 토큰이 없습니다.')
  }

  const tokens: Tokens = {
    accessToken: body.access_token,
    // 만료 직전에 걸려 재시도하는 걸 피하려고 1분 당겨 둔다
    accessExpiresAt: Date.now() + ((body.expires_in ?? 43_200) - 60) * 1000,
    refreshToken: body.refresh_token,
  }
  await store(tokens)
  return tokens
}

/**
 * 지금 쓸 수 있는 액세스 토큰.
 *
 * DB에 저장된 것이 있으면 그게 가장 최신이다(환경 변수의 씨앗은 첫 갱신 이후 죽는다).
 * force=true 는 게이트웨이가 401을 준 경우 — 만료 시각을 믿을 수 없다는 뜻이다.
 */
async function accessToken(force = false): Promise<string> {
  if (!force && cached && cached.accessExpiresAt > Date.now()) return cached.accessToken

  const stored = cached ?? (await readStored())
  if (stored) {
    cached = stored
    if (!force && stored.accessExpiresAt > Date.now()) return stored.accessToken
    return (await refresh(stored.refreshToken)).accessToken
  }

  const seed = readKey('PLAYMCP_REFRESH_TOKEN')
  if (!seed) throw new MissingUpstreamKeyError('PLAYMCP_REFRESH_TOKEN', REISSUE_GUIDE)
  return (await refresh(seed)).accessToken
}

/**
 * 게이트웨이 응답은 text/event-stream 으로 온다. 한 번의 tools/call 에 메시지는 하나뿐이라
 * 스트림으로 읽을 이유가 없어 본문을 통째로 받아 data: 줄만 꺼낸다.
 */
function parseMessage(text: string): unknown {
  const line = text.split('\n').find((row) => row.startsWith('data: '))
  try {
    return JSON.parse(line ? line.slice(6) : text)
  } catch {
    throw new UpstreamError(PLAYMCP_SOURCE, 'PlayMCP 응답을 해석하지 못했습니다.')
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function send(body: unknown, token: string, sessionId?: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  try {
    return await fetch(GATEWAY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError(PLAYMCP_SOURCE, `PlayMCP 응답이 ${TIMEOUT_MS / 1000}초 안에 오지 않았습니다.`)
    }
    throw new UpstreamError(PLAYMCP_SOURCE, 'PlayMCP에 연결하지 못했습니다.')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 게이트웨이는 토큰 버킷으로 막는다 — 한 번에 15회, 초당 3회씩 채워진다
 * (x-ratelimit-burst-capacity / replenish-rate). 한 화면이 다섯 번쯤 부르므로 보통은 남지만,
 * 새로고침을 연달아 하면 걸린다. 0.4초면 한 칸이 차므로 한 번만 쉬었다 다시 보낸다.
 */
async function post(body: unknown, token: string, sessionId?: string): Promise<Response> {
  const response = await send(body, token, sessionId)
  if (response.status !== 429) return response

  await sleep(500)
  return send(body, token, sessionId)
}

/**
 * 도구 호출 결과.
 *
 * 맛집검색은 후보를 못 만들면 예외가 아니라 isError 로 답한다('Top3 후보를 만들지 못했습니다').
 * 호출부는 그 경우 다른 검색어로 다시 물어봐야 하므로, 실패를 던지지 않고 값으로 돌려준다.
 */
export type ToolResult = { ok: true; text: string } | { ok: false; message: string }

export type McpSession = {
  call: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>
}

/**
 * 게이트웨이는 initialize 로 받은 Mcp-Session-Id 없이는 tools/call 을 받지 않는다.
 * 한 요청에서 여러 번 부를 수 있도록 세션을 열어 넘긴다.
 */
export async function openSession(): Promise<McpSession> {
  let token = await accessToken()

  const initialize = async (bearer: string) =>
    post(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'yanghwa-map', version: '1.0.0' },
        },
      },
      bearer,
    )

  let response = await initialize(token)
  if (response.status === 401) {
    // 만료 시각을 믿을 수 없다는 뜻이므로 강제로 갱신하고 한 번만 다시 시도한다
    token = await accessToken(true)
    response = await initialize(token)
  }
  if (response.status === 401) {
    throw new InvalidUpstreamKeyError('PLAYMCP_REFRESH_TOKEN', `게이트웨이가 토큰을 거부했습니다. ${REISSUE_GUIDE}`)
  }
  if (response.status === 429) throw new UpstreamError(PLAYMCP_SOURCE, RATE_LIMIT_MESSAGE)
  if (!response.ok) {
    throw new UpstreamError(PLAYMCP_SOURCE, `PlayMCP 게이트웨이가 HTTP ${response.status}를 돌려줬습니다.`)
  }

  const sessionId = response.headers.get('mcp-session-id')
  if (!sessionId) throw new UpstreamError(PLAYMCP_SOURCE, 'PlayMCP 게이트웨이가 세션을 주지 않았습니다.')

  // 프로토콜 예의상 보내지만 실패해도 호출에는 지장이 없다
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, token, sessionId).catch(() => {})

  return {
    async call(tool, args) {
      const request = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }
      const res = await post(request, token, sessionId)
      if (res.status === 429) throw new UpstreamError(PLAYMCP_SOURCE, RATE_LIMIT_MESSAGE)
      if (!res.ok) {
        throw new UpstreamError(PLAYMCP_SOURCE, `PlayMCP가 HTTP ${res.status}를 돌려줬습니다.`)
      }

      const message = parseMessage(await res.text()) as {
        error?: { message?: string }
        result?: { isError?: boolean; content?: { type: string; text?: string }[] }
      }
      if (message.error) {
        throw new UpstreamError(PLAYMCP_SOURCE, message.error.message ?? 'PlayMCP 호출이 거부됐습니다.')
      }

      const text = message.result?.content?.find((part) => part.type === 'text')?.text ?? ''
      if (message.result?.isError) return { ok: false, message: text || '도구가 실패를 돌려줬습니다.' }
      return { ok: true, text }
    },
  }
}
