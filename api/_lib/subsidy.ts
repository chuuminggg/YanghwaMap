import type {
  SubsidyModel,
  SubsidyModelResult,
  SubsidyRegion,
  SubsidyResult,
} from '../../src/types/drive.js'
import { InvalidInputError } from './db.js'
import { decodeProtectedHtml } from './pnp.js'
import { fetchUpstreamJson, fetchUpstreamText, first, UpstreamError } from './upstream.js'

/**
 * 지자체별 전기차 구매보조금 지급현황 — 환경부 무공해차 통합누리집(ev.or.kr).
 *
 * 인증이 필요 없는 공개 화면이지만 본문이 pnp4web 으로 감싸여 있어 먼저 복원해야 한다(pnp.ts).
 * 복원하고 나면 화면이 쓰는 데이터가 `<script type="application/json">` 블록에 그대로 들어 있다.
 * 표를 긁는 것보다 이쪽이 훨씬 안정적이다 — 표 모양이 바뀌어도 이 블록은 남는다.
 *
 * 모델별 보조금은 따로다. 이쪽은 보호 없는 순수 JSON(.ajax)이라 복원 없이 바로 읽는다.
 */

const BASE = 'https://ev.or.kr'
const STATUS_URL = `${BASE}/nportal/buySupprt/initSubsidyPaymentCheckAction.do`
const MODEL_URL = `${BASE}/nportal/buySupprt/getLocalCarModelPrice.ajax`
const SOURCE = '무공해차 통합누리집'

const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }

/** 차종 코드. 응답 JSON의 모델 목록 키(list11 등)도 이 코드로 만들어진다. */
export const VEHICLES: Record<string, { code: string; label: string }> = {
  passenger: { code: '11', label: '전기승용' },
  cargo: { code: '12', label: '전기화물' },
  bus: { code: '13', label: '전기승합' },
}

export type SubsidyParams = { vehicle: string; year: number }

/** 공고는 연 단위라 연도를 벗어난 값을 받아도 의미가 없다. */
const currentYear = () => Number(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 4))

export function parseSubsidyQuery(query: Record<string, string | string[] | undefined>): SubsidyParams {
  const vehicle = first(query.vehicle) ?? 'passenger'
  if (!(vehicle in VEHICLES)) {
    throw new InvalidInputError(`'vehicle'은 ${Object.keys(VEHICLES).join(', ')} 중 하나여야 합니다.`)
  }
  const now = currentYear()
  const year = Number(first(query.year) ?? now)
  if (!Number.isInteger(year) || year < 2015 || year > now + 1) {
    throw new InvalidInputError('조회할 수 없는 연도입니다.')
  }
  return { vehicle, year }
}

const post = (url: string, body: URLSearchParams) =>
  fetchUpstreamText(url, { source: SOURCE, method: 'POST', headers: FORM_HEADERS, body: body.toString() })

/**
 * 원본 대수는 '15430<br> (1893)<br> (0)' 처럼 총계 뒤에 구분별 내역이 붙는다.
 * 화면이 쓰는 값은 맨 앞 총계 하나다.
 */
const firstCount = (raw: unknown): number | null => {
  const head = String(raw ?? '').split(/<br\s*\/?>/i)[0]
  const value = Number(head.replace(/[^0-9-]/g, ''))
  return head.trim() && Number.isFinite(value) ? value : null
}

/** ETC(비고)에는 \r<br> 줄바꿈과 HTML 엔티티가 섞여 있다. */
const plain = (raw: unknown) =>
  String(raw ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** JSON 블록에 제어문자가 섞여 들어와 그대로는 JSON.parse 가 실패한다 (화면 스크립트도 같은 처리를 한다). */
const stripControl = (value: string) =>
  [...value].map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch)).join('')

/** 복원된 HTML에 박혀 있는 `<script type="application/json" id="...">` 블록 */
function jsonBlock<T>(html: string, id: string): T[] {
  // 본문이 여러 줄이라 . 이 줄바꿈까지 먹도록 dotAll(s) 플래그를 쓴다.
  // 템플릿 리터럴 안에서는 [\s\S] 같은 이스케이프가 그대로 살아남지 않아 이쪽이 안전하다.
  const match = html.match(
    new RegExp(`<script[^>]*type=["']application/json["'][^>]*id="${id}"[^>]*>(.*?)</script>`, 'is'),
  )
  if (!match) return []
  try {
    return JSON.parse(stripControl(match[1])) as T[]
  } catch {
    return []
  }
}

type LocalRow = Record<string, unknown>

/**
 * 신청 가능 여부. 잔여 대수가 양수여도 지자체 비고가 마감을 알리면 가능하다고 하지 않는다 —
 * 공고 대수와 실제 접수 상황은 따로 움직인다.
 */
function availability(remaining: number | null, note: string): SubsidyRegion['status'] {
  if (/마감|소진|종료|중단/.test(note)) return '마감'
  if (remaining === null) return '확인필요'
  return remaining > 0 ? '잔여있음' : '잔여없음'
}

export async function fetchSubsidyStatus({ vehicle, year }: SubsidyParams): Promise<SubsidyResult> {
  const { code, label } = VEHICLES[vehicle]

  const shell = await post(
    STATUS_URL,
    new URLSearchParams({ car_type: code, year1: String(year), localDo_cd: 'all', local_cd1: 'all' }),
  )
  const html = await decodeProtectedHtml(shell, STATUS_URL, (url) =>
    fetchUpstreamText(url, { source: SOURCE }),
  )

  const rows = jsonBlock<LocalRow>(html, 'localListData')
  if (rows.length === 0) {
    throw new UpstreamError(
      SOURCE,
      `${year}년 ${label} 지급현황을 찾지 못했습니다. 공고 전이거나 공식 페이지 구조가 바뀌었을 수 있습니다.`,
    )
  }

  const items = rows.map((row): SubsidyRegion => {
    const note = plain(row.ETC)
    const remaining = firstCount(row.RESICNT_1)
    return {
      localCode: String(row.LOCAL_CD ?? ''),
      sido: String(row.SHORT_AREA_NM ?? ''),
      name: String(row.LOCAL_NM ?? ''),
      vehicleLabel: String(row.NM ?? label),
      noticeCount: firstCount(row.TCNT_1),
      receivedCount: firstCount(row.RECEICNT_1),
      releasedCount: firstCount(row.RELEACNT_1),
      remainingCount: remaining,
      /** 선정잔여. 첫 칸이 비어 있는 지자체가 많다. */
      selectionRemaining: firstCount(row.REMAINCNT_1),
      acceptMethod: plain(row.ACCEPT),
      note,
      status: availability(remaining, note),
    }
  })

  return {
    year,
    vehicle,
    vehicleLabel: label,
    // 시도 칩도 실제 응답에 있는 값으로만 만든다
    sidoList: [...new Set(items.map((item) => item.sido).filter(Boolean))],
    items,
  }
}

export type ModelParams = { localCode: string; vehicle: string; year: number }

export function parseModelQuery(query: Record<string, string | string[] | undefined>): ModelParams {
  const localCode = first(query.localCode)?.trim() ?? ''
  if (!/^\d{2,6}$/.test(localCode)) throw new InvalidInputError("'localCode'가 올바르지 않습니다.")
  return { localCode, ...parseSubsidyQuery(query) }
}

/** '1,471' (만원) → 14710000 (원) */
const manwon = (raw: unknown): number | null => {
  const value = Number(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(value) ? value * 10_000 : null
}

/**
 * 지자체 하나의 모델별 보조금.
 * 이 응답만은 보호가 걸려 있지 않은 순수 JSON이라 pnp 복원을 거치지 않는다.
 */
export async function fetchSubsidyModels({
  localCode,
  vehicle,
  year,
}: ModelParams): Promise<SubsidyModelResult> {
  const { code, label } = VEHICLES[vehicle]

  const payload = await fetchUpstreamJson<Record<string, unknown>>(MODEL_URL, {
    source: SOURCE,
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({ year: String(year), local_cd: localCode }).toString(),
  })

  // 차종 코드가 그대로 키가 된다 (전기승용 11 → list11)
  const rows = payload[`list${code}`]
  const items = (Array.isArray(rows) ? rows : []).map((raw): SubsidyModel => {
    const row = raw as Record<string, unknown>
    return {
      maker: String(row.MAKER_NM ?? ''),
      model: String(row.MODEL_NM ?? ''),
      category: String(row.TYPE_NM ?? ''),
      nationalKrw: manwon(row.GAMT),
      localKrw: manwon(row.LAMT),
      totalKrw: manwon(row.TOTAL_AMT),
    }
  })

  return {
    localCode,
    vehicleLabel: label,
    year,
    // 보조금이 큰 순으로 — 어떤 차가 유리한지가 이 표를 보는 이유다
    items: items.sort((a, b) => (b.totalKrw ?? 0) - (a.totalKrw ?? 0)),
  }
}
