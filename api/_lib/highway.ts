import type {
  HighwayCctvResult,
  HighwayConzone,
  HighwayRoute,
  HighwayTraffic,
} from '../../src/types/drive.js'
import { InvalidInputError } from './db.js'
import { haversineMeters, inKorea } from './geo.js'
import { clamp, fetchUpstreamJson, fetchUpstreamText, first, optionalInt, UpstreamError } from './upstream.js'

/**
 * 고속도로 실시간 소통·교통량(한국도로공사)과 CCTV 메타데이터(국가교통정보센터 ITS).
 *
 * 두 곳 모두 공개 데모 키 `test` 로 회원가입 없이 동작한다(2026-08-31 확인). 그래서 이 탭만은
 * 아무 설정 없이 바로 쓸 수 있다. 데모 키가 회수되거나 쿼터가 모자라면 개인 키를 발급받아
 * EXDATA_API_KEY / ITS_API_KEY 로 넣으면 그대로 대체된다.
 */

const EXDATA_URL = 'https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime'
const ITS_CCTV_URL = 'https://openapi.its.go.kr:9443/cctvInfo'
const EXDATA_SOURCE = '한국도로공사'
const ITS_SOURCE = '국가교통정보센터'

/** 공개 데모 키. 개인 키가 있으면 그쪽이 이긴다. */
const exdataKey = () => process.env.EXDATA_API_KEY || 'test'
const itsKey = () => process.env.ITS_API_KEY || 'test'
/**
 * ITS 데모 키는 좌표 범위를 무시하고 늘 같은 20건(수도권제1순환선)을 돌려준다.
 * 부산·제주로 조회해도 응답이 같은 것을 확인했다(2026-08-31). 그래서 데모 키일 때는
 * 반경으로 자르면 목록이 늘 비어 고장처럼 보인다 — 자르지 않고 '표본'이라고 밝힌다.
 */
const usingDemoItsKey = () => !process.env.ITS_API_KEY

export const TRAFFIC_LIMITS = { min: 5, max: 100, fallback: 30 }
/** CCTV는 고속도로변에만 있어 반경을 넓게 잡아야 하나라도 걸린다. */
export const CCTV_RADIUS_LIMITS = { min: 2_000, max: 30_000, fallback: 10_000 }
export const CCTV_LIMITS = { min: 1, max: 50, fallback: 20 }

/** 원본이 자료 없음을 -1 로 표시한다. 그대로 평균에 넣으면 속도가 음수가 된다. */
const numeric = (raw: string | undefined): number | null => {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

const GRADE_LABELS: Record<string, HighwayConzone['gradeLabel']> = {
  '1': '원활',
  '2': '서행',
  '3': '정체',
}

/**
 * 상·하행 판별. 원본은 방위(S/N/E/W)로 준다.
 * 남북축 노선은 S/N, 동서축 노선은 E/W 를 쓰고 각각 앞쪽이 상행(서울 방향)이다.
 */
const directionOf = (code: string): HighwayConzone['direction'] =>
  code === 'S' || code === 'N' ? '상행' : code === 'E' || code === 'W' ? '하행' : ''

type TrafficRow = {
  stdHour?: string
  stdDate?: string
  routeNo?: string
  routeName?: string
  updownTypeCode?: string
  conzoneId?: string
  conzoneName?: string
  speed?: string
  trafficAmout?: string
  grade?: string
}

type TrafficPayload = { code?: string; count?: number; list?: TrafficRow[] }

/** '20260831' + '2158' → '21:58' */
const timeOf = (row: TrafficRow) => {
  const hour = row.stdHour ?? ''
  return hour.length === 4 ? `${hour.slice(0, 2)}:${hour.slice(2)}` : ''
}

export type TrafficParams = { route: string | null; keyword: string | null; limit: number }

export function parseTrafficQuery(query: Record<string, string | string[] | undefined>): TrafficParams {
  const route = first(query.route)?.trim() || null
  const keyword = first(query.keyword)?.trim() || null
  if ((route?.length ?? 0) > 30 || (keyword?.length ?? 0) > 30) {
    throw new InvalidInputError('노선·키워드는 30자를 넘을 수 없습니다.')
  }
  return { route, keyword, limit: optionalInt(query.limit, TRAFFIC_LIMITS) }
}

/**
 * 한 콘존에는 검지기(vdsId)가 여러 대라 같은 구간이 여러 행으로 온다.
 * 그대로 보여 주면 '구서IC-영락IC'가 목록에 세 번 뜨므로 콘존×방향으로 묶어
 * 속도는 평균, 교통량은 합, 소통등급은 가장 나쁜 값을 취한다.
 */
function foldConzones(rows: TrafficRow[]): HighwayConzone[] {
  const groups = new Map<string, { row: TrafficRow; speeds: number[]; amount: number; grade: number | null }>()

  for (const row of rows) {
    if (!row.conzoneId) continue
    const id = `${row.conzoneId}:${row.updownTypeCode ?? ''}`
    const group = groups.get(id) ?? { row, speeds: [], amount: 0, grade: null }

    const speed = numeric(row.speed)
    if (speed !== null) group.speeds.push(speed)

    const amount = numeric(row.trafficAmout)
    if (amount !== null) group.amount += amount

    const grade = numeric(row.grade)
    if (grade !== null && grade > 0) group.grade = Math.max(group.grade ?? 0, grade)

    groups.set(id, group)
  }

  return [...groups.entries()].map(([id, { row, speeds, amount, grade }]) => ({
    id,
    routeNo: row.routeNo ?? '',
    routeName: row.routeName ?? '',
    conzoneName: row.conzoneName ?? '',
    direction: directionOf(row.updownTypeCode ?? ''),
    speed: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null,
    trafficAmount: amount || null,
    grade: grade as HighwayConzone['grade'],
    gradeLabel: GRADE_LABELS[String(grade)] ?? '',
    updatedAt: timeOf(row),
  }))
}

export async function fetchTraffic({ route, keyword, limit }: TrafficParams): Promise<HighwayTraffic> {
  // 이 엔드포인트는 numOfRows/pageNo 를 무시하고 전국 8천여 행을 한 번에 준다.
  // 브라우저로 그대로 넘기면 1.5MB라, 서버에서 걸러 필요한 만큼만 내려보낸다.
  const url = `${EXDATA_URL}?key=${encodeURIComponent(exdataKey())}&type=json`
  const payload = await fetchUpstreamJson<TrafficPayload>(url, { source: EXDATA_SOURCE })

  // 인증 실패도 HTTP 200으로 오므로 code 로만 알 수 있다
  if (payload.code && payload.code !== 'SUCCESS') {
    throw new UpstreamError(
      EXDATA_SOURCE,
      '한국도로공사 공개 데모 키가 거부됐습니다. data.ex.co.kr 에서 키를 발급받아 EXDATA_API_KEY 에 넣어 주세요.',
    )
  }

  const all = foldConzones(payload.list ?? [])

  // 노선 칩은 실제로 응답에 들어 있는 노선으로만 만든다 — 고정 목록을 두면 원본이 바뀔 때 어긋난다
  const counts = new Map<string, HighwayRoute>()
  for (const item of all) {
    if (!item.routeName) continue
    const entry = counts.get(item.routeName) ?? { routeNo: item.routeNo, routeName: item.routeName, count: 0 }
    entry.count += 1
    counts.set(item.routeName, entry)
  }
  const routes = [...counts.values()].sort((a, b) => a.routeNo.localeCompare(b.routeNo))

  const matched = all.filter(
    (item) =>
      (!route || item.routeName === route || item.routeNo === route) &&
      (!keyword || item.conzoneName.includes(keyword)),
  )

  // 막히는 곳을 먼저 보여 준다. 같은 등급이면 느린 순.
  const sorted = matched.sort(
    (a, b) => (b.grade ?? 0) - (a.grade ?? 0) || (a.speed ?? 999) - (b.speed ?? 999),
  )

  return {
    routes,
    items: sorted.slice(0, limit),
    total: matched.length,
    updatedAt: all.find((item) => item.updatedAt)?.updatedAt ?? '',
  }
}

export type CctvParams = { lat: number; lng: number; radiusMeters: number; limit: number; roadType: string }

/** ITS 는 좌표 범위를 검증하므로 우리 쪽에서 먼저 자른다 (경도 124~132, 위도 33~39.5). */
export function parseCctvQuery(query: Record<string, string | string[] | undefined>): CctvParams {
  const lat = Number(first(query.lat))
  const lng = Number(first(query.lng))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) {
    throw new InvalidInputError('국내 좌표(lat, lng)가 필요합니다.')
  }
  const roadType = first(query.roadType) ?? 'ex'
  if (!['ex', 'its', 'all'].includes(roadType)) {
    throw new InvalidInputError("'roadType'은 ex / its / all 중 하나여야 합니다.")
  }
  return {
    lat,
    lng,
    radiusMeters: optionalInt(query.radius, CCTV_RADIUS_LIMITS),
    limit: optionalInt(query.limit, CCTV_LIMITS),
    roadType,
  }
}

/** 성공 응답도 XML이라(getType=json을 줘도) 직접 읽는다. 필드가 열 개뿐이라 정규식으로 충분하다. */
function parseCctvXml(xml: string): { name: string; lat: number; lng: number; url: string; format: string }[] {
  const tag = (block: string, name: string) =>
    block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1]?.trim() ?? ''

  return [...xml.matchAll(/<data>([\s\S]*?)<\/data>/gi)]
    .map((match) => ({
      name: tag(match[1], 'cctvname'),
      lat: Number(tag(match[1], 'coordy')),
      lng: Number(tag(match[1], 'coordx')),
      url: tag(match[1], 'cctvurl'),
      format: tag(match[1], 'cctvformat'),
    }))
    .filter((item) => item.name && Number.isFinite(item.lat) && Number.isFinite(item.lng))
}

export async function fetchCctv({
  lat,
  lng,
  radiusMeters,
  limit,
  roadType,
}: CctvParams): Promise<HighwayCctvResult> {
  // ITS는 반경이 아니라 사각 범위로 받는다. 위도 1도 ≈ 111.32km 로 반경을 각도로 바꾼다.
  const dLat = radiusMeters / 111_320
  const dLng = radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))

  const params = new URLSearchParams({
    apiKey: itsKey(),
    type: roadType,
    cctvType: '1',
    minX: String(clamp(lng - dLng, 124, 132)),
    maxX: String(clamp(lng + dLng, 124, 132)),
    minY: String(clamp(lat - dLat, 33, 39.5)),
    maxY: String(clamp(lat + dLat, 33, 39.5)),
    getType: 'json',
  })

  const xml = await fetchUpstreamText(`${ITS_CCTV_URL}?${params}`, { source: ITS_SOURCE })
  if (/resultCode>\s*4\d{3}/.test(xml) || /인증/.test(xml)) {
    throw new UpstreamError(
      ITS_SOURCE,
      'ITS 공개 데모 키가 거부됐습니다. openapi.its.go.kr 에서 키를 발급받아 ITS_API_KEY 에 넣어 주세요.',
    )
  }

  const sample = usingDemoItsKey()
  const items = parseCctvXml(xml)
    .map((item, index) => ({
      // 원본에 안정적인 식별자가 없다. 좌표는 카메라마다 다르므로 순번과 묶으면 충분히 유일하다.
      id: `${item.lat},${item.lng},${index}`,
      name: item.name,
      lat: item.lat,
      lng: item.lng,
      streamUrl: item.url,
      format: item.format,
      distanceMeters: Math.round(haversineMeters({ lat, lng }, { lat: item.lat, lng: item.lng })),
    }))
    // 데모 키는 애초에 범위를 무시하고 답하므로 반경으로 자르면 전부 사라진다
    .filter((item) => sample || item.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit)

  return { items, sample }
}
