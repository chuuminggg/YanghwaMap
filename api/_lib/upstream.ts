/**
 * 외부 공공 API를 부르는 공통부.
 *
 * 맛집·화장실과 달리 '운전' 탭 데이터는 DB에 없다. 매 요청마다 원본 기관을 직접 부르고
 * 결과는 CDN 캐시(Cache-Control)로만 아낀다. 브라우저가 직접 부를 수 없는 이유는 셋이다.
 *   - CORS: 어느 기관도 허용 헤더를 주지 않는다
 *   - 인증키: 노출되면 그대로 남의 쿼터를 쓴다
 *   - 응답 크기: 도로공사 소통 정보는 한 번에 8천 행(1.5MB)이라 그대로 내려보내면 안 된다
 */

/** 원본이 실패했을 때. 우리 잘못이 아니므로 502로 내보낸다. */
export class UpstreamError extends Error {
  /** '한국도로공사'처럼 사용자에게 보여 줄 기관 이름 */
  readonly source: string
  constructor(source: string, message: string) {
    super(message)
    this.name = 'UpstreamError'
    this.source = source
  }
}

/** 인증키가 아예 없어 호출을 시도조차 못 한 경우. 설정 문제이므로 503 + 발급 안내. */
export class MissingUpstreamKeyError extends Error {
  constructor(envName: string, guide: string) {
    super(`${envName}가 설정되지 않았습니다. ${guide}`)
    this.name = 'MissingUpstreamKeyError'
  }
}

/**
 * data.ex.co.kr은 기본 UA(curl/node)를 WAF가 400 'Request Blocked'로 막는다.
 * 나머지 기관도 브라우저 UA를 싫어하지 않으므로 전부 같은 값을 쓴다.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Vercel Hobby의 함수 실행 상한이 10초라 그 안에서 끊어야 우리 쪽 에러로 응답할 수 있다. */
const DEFAULT_TIMEOUT_MS = 8_000

type Options = {
  /** 실패 메시지에 넣을 기관 이름 */
  source: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

async function call(url: string, options: Options): Promise<Response> {
  const { source, method = 'GET', headers, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      method,
      headers: { 'user-agent': BROWSER_UA, 'accept-language': 'ko-KR,ko;q=0.9', ...headers },
      body,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError(source, `${source} 응답이 ${timeoutMs / 1000}초 안에 오지 않았습니다.`)
    }
    throw new UpstreamError(source, `${source}에 연결하지 못했습니다.`)
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchUpstreamText(url: string, options: Options): Promise<string> {
  const response = await call(url, options)
  if (!response.ok) {
    throw new UpstreamError(options.source, `${options.source}가 HTTP ${response.status}를 돌려줬습니다.`)
  }
  return response.text()
}

/**
 * 본문이 JSON이 아닐 때(점검 안내 HTML, 게이트웨이 XML 오류)를 원본 실패로 구분한다.
 * 파싱 실패를 500으로 흘리면 우리 버그처럼 보인다.
 */
export async function fetchUpstreamJson<T>(url: string, options: Options): Promise<T> {
  const text = await fetchUpstreamText(url, options)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new UpstreamError(
      options.source,
      `${options.source} 응답을 해석하지 못했습니다. 점검 중이거나 인증키가 거부됐을 수 있습니다.`,
    )
  }
}

/** 쿼리스트링 값은 string | string[] | undefined 로 들어온다. api/_lib/restrooms.ts와 같은 규칙. */
export const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

/** 범위를 벗어난 값은 거절하지 않고 조용히 자른다 — 지도 UI가 멈추는 것보다 낫다. */
export function optionalInt(
  raw: string | string[] | undefined,
  limits: { min: number; max: number; fallback: number },
): number {
  const value = Number(first(raw))
  if (!first(raw) || !Number.isFinite(value)) return limits.fallback
  return Math.round(clamp(value, limits.min, limits.max))
}
