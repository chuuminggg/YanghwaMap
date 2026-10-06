import type { RecommendPlace, RecommendResult, RecommendSource } from '../../src/types/recommend.js'
import { InvalidInputError } from './db.js'
import { MissingKakaoKeyError } from './geocode.js'
import { haversineMeters, inKorea, type LatLng } from './geo.js'
import { openSession, PLAYMCP_SOURCE, type McpSession } from './playmcp.js'
import { resolveRegion } from './region.js'
import { first, readKey, UpstreamError } from './upstream.js'

/**
 * '추천' 탭의 본문. 현재 위치 → 검색어 → PlayMCP 맛집검색 → 좌표 순으로 엮는다.
 *
 * 맛집검색 도구는 좌표를 받지 않고 '합정역 맛집' 같은 문자열만 받는다. 그래서 위치를
 * 먼저 지역 이름으로 바꿔야 하는데, 어떤 이름을 주느냐가 결과를 가른다 —
 * 직접 불러 본 결과 '합정역 맛집'은 되고 '합정동 맛집' · '마포구 맛집'은 후보를 못 만든다.
 * 그래서 가까운 지하철역 이름을 먼저 쓰고, 역이 없을 때만 행정구역 이름으로 넘어간다.
 *
 * 한 질의가 돌려주는 곳은 최대 3곳이라 목록이 너무 짧다. 가까운 역 세 곳까지 물어
 * 합치고 중복을 지운다. 호출이 빨라서(보통 1초 안쪽) 셋을 병렬로 불러도 부담이 없다.
 */

const SEARCH_TOOL = 'kakaoFoodFinder-search_and_recommend_places'
const FINALIZE_TOOL = 'kakaoFoodFinder-kakao_recommend_finalize'

/** 검색 기준으로 삼을 역의 최대 개수 */
const MAX_REGIONS = 3
/** 이 반경 안에 역이 없으면 행정구역 이름으로 넘어간다 */
const STATION_RADIUS_M = 3_000

export type RecommendQuery = { origin: LatLng; keyword: string }

export function parseRecommendQuery(query: Record<string, string | string[] | undefined>): RecommendQuery {
  const lat = Number(first(query.lat))
  const lng = Number(first(query.lng))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) {
    throw new InvalidInputError('국내 좌표(lat, lng)가 필요합니다.')
  }

  // 키워드는 그대로 검색어에 붙으므로 길이만 자른다. 한 단어로 쓰라는 안내는 화면이 한다.
  const keyword = (first(query.keyword) ?? '').trim().slice(0, 20)
  return { origin: { lat, lng }, keyword }
}

type KakaoDocument = {
  id: string
  place_name: string
  x: string
  y: string
}

async function kakaoLocal(path: string, params: Record<string, string>): Promise<KakaoDocument[]> {
  const key = readKey('KAKAO_REST_API_KEY')
  if (!key) throw new MissingKakaoKeyError()

  const url = `https://dapi.kakao.com/v2/local/${path}?${new URLSearchParams(params)}`
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })

  if (response.status === 401 || response.status === 403) {
    throw new InvalidInputError(
      `카카오 인증에 실패했습니다 (HTTP ${response.status}). REST API 키와 카카오맵/로컬 API 사용 설정을 확인해 주세요.`,
    )
  }
  if (!response.ok) throw new UpstreamError('카카오 로컬', `카카오 로컬이 HTTP ${response.status}를 돌려줬습니다.`)

  const body = (await response.json()) as { documents?: KakaoDocument[] }
  return body.documents ?? []
}

/**
 * '합정역 2호선' → '합정역', '정자역 수인분당선' → '정자역'.
 *
 * 카카오는 환승역을 노선마다 따로 준다. 노선 이름은 '2호선'일 때도 '신분당선'일 때도 있어
 * 노선 쪽을 지우는 규칙은 계속 새 예외를 만난다. 대신 역 이름이 항상 '역'으로 끝난다는 걸 쓴다.
 */
const stationName = (raw: string) => raw.match(/^(.*?역)(?:\s|$)/)?.[1]?.trim() ?? ''

/** 가까운 역 이름을 가까운 순으로. 같은 역의 다른 노선은 하나로 합친다. */
async function nearbyStations(origin: LatLng): Promise<string[]> {
  const documents = await kakaoLocal('search/category.json', {
    category_group_code: 'SW8',
    x: String(origin.lng),
    y: String(origin.lat),
    radius: String(STATION_RADIUS_M),
    sort: 'distance',
    size: '15',
  })

  const names: string[] = []
  for (const document of documents) {
    const name = stationName(document.place_name)
    if (name && !names.includes(name)) names.push(name)
    if (names.length === MAX_REGIONS) break
  }
  return names
}

type Prepared = {
  place: {
    이름: string
    카테고리: string
    지도URL: string
    도로명주소: string
    지번주소: string
  }
  meta_total_count?: number
  total_docs_count?: number
  promo_docs_count?: number
  valid_documents?: { title?: string; url?: string; datetime?: string; promo_flag?: boolean }[]
  step6_metrics?: { recent_valid_count?: number }
}

type SearchPayload = {
  ok?: boolean
  normalized?: { region?: string; keywords?: string[] }
  top3_prepared?: Prepared[]
}

type FinalizePayload = {
  recommendations?: {
    링크?: { 지도URL?: string }
    디버그?: { final_score?: number }
  }[]
}

const parseJson = <T,>(text: string): T => {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new UpstreamError(PLAYMCP_SOURCE, '맛집검색 응답을 해석하지 못했습니다.')
  }
}

/** 카카오 장소 URL('http://place.map.kakao.com/1355186437')에서 장소 ID를 꺼낸다. */
const placeId = (mapUrl: string) => mapUrl.match(/(\d+)\s*$/)?.[1] ?? mapUrl

/** 블로그 제목은 검색어가 <b>로 강조된 채 온다. 그대로 쓰면 태그가 글자로 보인다. */
const plainText = (raw: string) =>
  raw
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * 추천 목록에 남길 만한 곳인지 카카오 카테고리로 거른다.
 *
 * '맛집'으로 검색해도 음식점만 오지 않는다 — 만화카페·보드카페가 섞여 들어오므로
 * 카테고리 첫 단계가 '음식점'인 것만 남긴다(카페·제과도 그 아래에 있다).
 */
function isRestaurant(category: string, name: string, keyword: string): boolean {
  if (!category.startsWith('음식점')) return false

  // 카카오는 프랜차이즈를 카테고리 끝에 브랜드로 단다
  // ('음식점 > 간식 > 아이스크림 > 배스킨라빈스'). 상호가 그 브랜드로 시작하면 체인 지점이다.
  // 어디에나 있는 체인은 '어디서 먹을까'의 답이 아니라서 뺀다 — 다만 사용자가 그 브랜드를
  // 찾고 있다면 답이 맞으므로 키워드에 걸리면 남긴다.
  // 브랜드 뒤에 지점 표시('… 상수역점', '스타벅스 서울숲역')가 붙었는지까지 봐야 한다.
  // 카테고리 끝이 '칼국수' 같은 일반 명사일 때도 있어서, 상호가 그 말로 시작한다는 것만으로
  // 체인이라 단정하면 동네 칼국수집이 함께 잘려 나간다.
  const brand = (category.split('>').pop() ?? '').trim().replace(/\s/g, '')
  const compact = name.replace(/\s/g, '')
  const branch = compact.startsWith(brand) ? compact.slice(brand.length) : ''
  const isChain = brand.length >= 2 && branch.length > 0 && /[점역]/.test(branch)
  return !isChain || (keyword.length >= 2 && (brand.includes(keyword) || keyword.includes(brand)))
}

/** 한 지역의 후보를 받아 온다. 점수는 지역을 다 모은 뒤 한 번에 매긴다. */
async function searchRegion(
  session: McpSession,
  region: string,
  keyword: string,
): Promise<{ region: string; prepared: Prepared[] } | null> {
  const query = [region, keyword, '맛집'].filter(Boolean).join(' ')
  const search = await session.call(SEARCH_TOOL, { query })
  // 후보를 못 만든 지역은 실패가 아니다 — 다른 역이 채워 준다
  if (!search.ok) return null

  const payload = parseJson<SearchPayload>(search.text)
  const prepared = (payload.top3_prepared ?? []).filter((item) =>
    isRestaurant(item.place.카테고리 ?? '', item.place.이름 ?? '', keyword),
  )
  if (prepared.length === 0) return null

  return { region: payload.normalized?.region || region, prepared }
}

/**
 * 모아 온 후보에 점수를 매긴다.
 *
 * 두 번째 도구(finalize)는 원래 LLM이 만든 내용 신호(⑦ JSON)를 받도록 돼 있지만, 직접 확인해 보니
 * 그 값을 점수에 반영하지 않는다 — 어떤 값을 넣어도 final_score 가 같았다. 그래서 LLM을 끼우지
 * 않고 place_url 만 넘겨 부른다. 여기서 쓰는 건 도구가 계산한 순위 점수뿐이다.
 * (없는 감상평을 지어내 붙이는 것보다, 근거가 된 블로그 글을 그대로 보여 주는 편이 정직하다.)
 *
 * 지역마다 따로 부르지 않고 한 번에 모아 부르는 이유는 둘이다. 게이트웨이 호출 한도(초당 3회)를
 * 아끼고, 세 역에서 온 곳들이 같은 기준으로 매겨져 하나의 목록으로 줄 세울 수 있다.
 */
async function scoreAll(session: McpSession, prepared: Prepared[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>()
  const finalize = await session.call(FINALIZE_TOOL, {
    prepared,
    ai_outputs: prepared.map((item) => ({ place_url: item.place.지도URL })),
    top_k: prepared.length,
    debug: true,
  })
  if (!finalize.ok) return scores

  for (const item of parseJson<FinalizePayload>(finalize.text).recommendations ?? []) {
    const url = item.링크?.지도URL
    if (url) scores.set(placeId(url), item.디버그?.final_score ?? 0)
  }
  return scores
}

function toPlace(item: Prepared, region: string, score: number): RecommendPlace {
  const sources: RecommendSource[] = (item.valid_documents ?? [])
    .filter((document) => document.url && !document.promo_flag)
    .slice(0, 3)
    .map((document) => ({
      title: plainText(document.title ?? ''),
      url: document.url!,
      publishedAt: document.datetime ?? '',
    }))

  return {
    id: placeId(item.place.지도URL),
    name: item.place.이름,
    category: item.place.카테고리 ?? '',
    address: item.place.도로명주소 || item.place.지번주소 || '',
    mapUrl: item.place.지도URL,
    region,
    score,
    mentionCount: item.meta_total_count ?? 0,
    promoCount: item.promo_docs_count ?? 0,
    recentCount: item.step6_metrics?.recent_valid_count ?? 0,
    sources,
  }
}

/**
 * 추천 결과에 좌표를 붙인다.
 *
 * 맛집검색은 주소만 주고 좌표를 주지 않는다. 카카오 키워드 검색으로 같은 장소 ID를 찾아
 * 좌표를 얻고, 못 찾으면 도로명주소로 한 번 더 시도한다. 둘 다 실패하면 좌표 없이 남긴다 —
 * 지도에 못 찍을 뿐 목록에는 그대로 둔다(화장실 화면과 같은 규칙).
 */
async function locate(place: RecommendPlace, origin: LatLng): Promise<RecommendPlace> {
  const byKeyword = await kakaoLocal('search/keyword.json', {
    query: place.name,
    x: String(origin.lng),
    y: String(origin.lat),
    radius: '20000',
    size: '5',
  })
  const hit =
    byKeyword.find((document) => document.id === place.id) ??
    byKeyword.find((document) => document.place_name === place.name)

  let lat = hit ? Number(hit.y) : NaN
  let lng = hit ? Number(hit.x) : NaN

  if (!Number.isFinite(lat) && place.address) {
    const byAddress = await kakaoLocal('search/address.json', { query: place.address, size: '1' })
    lat = Number(byAddress[0]?.y)
    lng = Number(byAddress[0]?.x)
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) return place
  return { ...place, lat, lng, distanceMeters: Math.round(haversineMeters(origin, { lat, lng })) }
}

export async function recommendNearby(query: RecommendQuery): Promise<RecommendResult> {
  const cached = readCache(query)
  if (cached) return cached

  const { origin, keyword } = query
  const stations = await nearbyStations(origin)

  // 역이 없는 동네에서는 행정구역 이름으로 물어본다. '시도 시군구 동' 형태가 맨 앞이다 —
  // 동 이름만 주면 맛집검색이 후보를 못 만드는 경우가 많았다.
  const regions = stations.length > 0 ? stations : [await regionQuery(origin)]

  const session = await openSession()
  const results = await Promise.all(regions.map((region) => searchRegion(session, region, keyword)))

  // 역 이름으로 전부 실패하면 행정구역 이름으로 한 번 더 물어본다. 도구가 어떤 지역 이름을
  // 받아 주는지는 규칙이 없어서(판교역은 안 되고 '경기도 성남시 분당구 백현동'은 된다)
  // 빈손으로 끝내기 전에 다른 이름으로 한 번은 더 시도할 값이 있다.
  if (!results.some((result) => result !== null) && stations.length > 0) {
    const fallback = await regionQuery(origin)
    const extra = await searchRegion(session, fallback, keyword)
    if (extra) {
      results.push(extra)
      regions.push(fallback)
    }
  }

  const found: string[] = []
  const skipped: string[] = []
  /** 장소 ID → 어느 지역 검색에서 나왔는지. 같은 집이 두 역에 걸리면 먼저(가까운) 역을 남긴다. */
  const origins = new Map<string, { region: string; item: Prepared }>()

  results.forEach((result, index) => {
    if (!result) {
      skipped.push(regions[index])
      return
    }
    found.push(result.region)
    for (const item of result.prepared) {
      const id = placeId(item.place.지도URL)
      if (!origins.has(id)) origins.set(id, { region: result.region, item })
    }
  })

  if (origins.size === 0) {
    return remember(query, { regions: found, skipped, keyword, places: [] })
  }

  const entries = [...origins.values()]
  const scores = await scoreAll(session, entries.map((entry) => entry.item))
  const places = entries.map((entry, index) =>
    // finalize 가 점수를 못 준 경우에도 도구가 고른 순서는 남긴다
    toPlace(entry.item, entry.region, scores.get(placeId(entry.item.place.지도URL)) ?? entries.length - index),
  )

  const located = await Promise.all(places.map((place) => locate(place, origin)))
  // 점수순이 기본이다. 거리순 정렬은 좌표를 함께 내려 주므로 화면에서 바로 바꿀 수 있다.
  located.sort((a, b) => b.score - a.score)

  return remember(query, { regions: found, skipped, keyword, places: located })
}

/**
 * 같은 자리에서의 재조회를 한 번만 원본까지 보낸다.
 *
 * 배포에서는 CDN 캐시(Cache-Control)가 막아 주지만, 한 인스턴스 안에서도 막을 곳이 있다 —
 * 개발 중 StrictMode 는 효과를 두 번 실행하고, 지도를 움직이면 좌표가 미세하게 바뀐다.
 * 게이트웨이 한도가 초당 3회라 이 정도 중복도 아깝다. 좌표는 약 100m 격자로 뭉갠다.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; result: RecommendResult }>()

const cacheKey = ({ origin, keyword }: RecommendQuery) =>
  `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)},${keyword}`

function readCache(query: RecommendQuery): RecommendResult | null {
  const hit = cache.get(cacheKey(query))
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null

  // 목록은 재사용해도 거리는 지금 서 있는 자리에서 다시 잰다 — 격자 안에서도 100m쯤 어긋난다
  const places = hit.result.places.map((place) =>
    place.lat === undefined || place.lng === undefined
      ? place
      : { ...place, distanceMeters: Math.round(haversineMeters(query.origin, { lat: place.lat, lng: place.lng })) },
  )
  return { ...hit.result, places }
}

function remember(query: RecommendQuery, result: RecommendResult): RecommendResult {
  cache.set(cacheKey(query), { at: Date.now(), result })
  return result
}

async function regionQuery(origin: LatLng): Promise<string> {
  const region = await resolveRegion(origin.lat, origin.lng)
  return [region.sido, region.sigungu, region.dong].filter(Boolean).join(' ')
}
