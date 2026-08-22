/**
 * src/data/seed-restrooms.json 의 주소를 카카오 REST API로 좌표로 바꾼다.
 *
 * 공중화장실 표준데이터는 2025년 2월부로 좌표 제공이 중단되어 주소만 남았다.
 * 이 스크립트는 일회성 빌드 단계다 — 결과 JSON이 커밋되므로 앱 런타임에는 REST 키가 필요 없다.
 *
 *   KAKAO_REST_API_KEY=... npm run restrooms:geocode
 *   npm run restrooms:geocode -- --force     이미 좌표가 있는 행도 다시 조회
 *
 * 키 발급: 카카오 개발자센터 > 내 애플리케이션 > 앱 키 > REST API 키
 *          (지도 SDK용 JavaScript 키와 같은 앱에서 나온다)
 *
 * 중간 저장하므로 끊겨도 다시 실행하면 남은 행부터 이어서 진행한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}

const FILE = resolve(root, opt('file', 'src/data/seed-restrooms.json'))
const KEY = process.env.KAKAO_REST_API_KEY
const CONCURRENCY = Number(opt('concurrency', 4))
const SAVE_EVERY = 200

if (!KEY) {
  console.error(`KAKAO_REST_API_KEY 가 없습니다.

  .env.local 에 아래 줄을 추가하고 다시 실행하세요:
    KAKAO_REST_API_KEY=<카카오 개발자센터 > 내 애플리케이션 > 앱 키 > REST API 키>

  지도에 쓰는 VITE_KAKAO_MAP_APP_KEY(JavaScript 키)와는 다른 키입니다. 같은 앱에서 함께 발급됩니다.`)
  process.exit(1)
}

/* ---------- 좌표 위생 ---------- */
/** 대한민국 본토 + 도서 범위. 카카오가 엉뚱한 곳을 집어 주는 경우를 거른다. */
const inKorea = (lat, lng) => lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132

/* ---------- 주소 정리 ---------- */
/**
 * '서울특별시 마포구 방울내로 19, 공중화장실 (망원동)' -> '서울특별시 마포구 방울내로 19'
 * 쉼표 뒤 상세주소와 괄호 안 법정동은 카카오 주소검색에서 오히려 매칭을 방해한다.
 */
const cleanAddress = (raw) =>
  (raw ?? '')
    .split(',')[0]
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * 시도 이름만 남은 주소('서울특별시')로는 검색하면 안 된다.
 * 카카오가 시청 근처 아무 점이나 돌려줘서 엉뚱한 좌표가 박힌다.
 */
const searchable = (address) => address.replace(/^\S+(?:특별시|광역시|특별자치시|특별자치도|도)\s*/, '').length > 0

/**
 * '효창운동장화장실' -> '효창운동장', '봉화산근린공원(유아숲체험장)' -> '봉화산근린공원'
 *
 * 공원·운동장 안 화장실은 정식 건물번호가 없어 주소검색이 통하지 않는다. 시설명 자체도
 * '...화장실' 형태라 POI로 안 잡히므로, 접미사와 괄호를 떼어 시설을 먼저 찾는다.
 * 다만 이렇게 얻은 좌표는 화장실이 아니라 시설 대표 지점이라 오차가 크다 - source 로 구분한다.
 */
const venueName = (name) =>
  (name ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(공중|개방|간이|이동)?화장실/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** '서울특별시 마포구 방울내로 19' -> '서울특별시 마포구' (키워드 검색 보조용) */
const districtOf = (raw) => {
  const m = (raw ?? '').match(/^(\S+(?:시|도))\s+(\S+(?:시|군|구))/)
  return m ? `${m[1]} ${m[2]}` : ''
}

/* ---------- 카카오 호출 ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let calls = 0

/** 초당 제한을 다 쓰고도 못 받았을 때. '결과 없음'과 구분해야 영구 실패로 오기록하지 않는다. */
const RATE_LIMITED = Symbol('rate-limited')

async function kakao(path, query) {
  const url = `https://dapi.kakao.com/v2/local/${path}?query=${encodeURIComponent(query)}&size=1`

  for (let attempt = 0; attempt < 6; attempt++) {
    calls++
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } })

    if (response.status === 429) {
      await sleep(500 * 2 ** attempt) // 지수 백오프: 0.5s, 1s, 2s, 4s, 8s, 16s
      continue
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `카카오 인증 실패 (HTTP ${response.status}). REST API 키가 맞는지, ` +
          '카카오 개발자센터에서 "카카오맵" 또는 "로컬" API 사용 설정이 켜져 있는지 확인하세요.',
      )
    }
    if (!response.ok) return null

    const body = await response.json()
    const doc = body.documents?.[0]
    if (!doc) return null

    const lat = Number(doc.y)
    const lng = Number(doc.x)
    return inKorea(lat, lng) ? { lat, lng } : null
  }
  return RATE_LIMITED
}

/** 도로명주소 -> 지번주소 -> '구 + 화장실명' 키워드 순으로 시도한다. */
async function geocode(item) {
  let throttled = false
  const attempt = async (path, query, source) => {
    const hit = await kakao(path, query)
    if (hit === RATE_LIMITED) {
      throttled = true
      return null
    }
    return hit ? { ...hit, source } : null
  }

  const road = cleanAddress(item.roadAddress)
  if (road && searchable(road)) {
    const hit = await attempt('search/address.json', road, 'road')
    if (hit) return hit
  }

  const jibun = cleanAddress(item.jibunAddress)
  if (jibun && jibun !== road && searchable(jibun)) {
    const hit = await attempt('search/address.json', jibun, 'jibun')
    if (hit) return hit
  }

  const district = item.district || districtOf(item.roadAddress || item.jibunAddress)
  if (district && item.name) {
    const hit = await attempt('search/keyword.json', `${district} ${item.name}`, 'keyword')
    if (hit) return hit

    // 마지막 수단: 시설명만으로 찾는다. 좌표가 시설 대표 지점이라 정확도가 낮다.
    const venue = venueName(item.name)
    if (venue.length >= 2 && venue !== item.name) {
      const byVenue = await attempt('search/keyword.json', `${district} ${venue}`, 'venue')
      if (byVenue) return byVenue
    }
  }

  // 제한에 걸려 못 받은 것뿐이면 실패로 굳히지 않고 다음 실행으로 넘긴다
  return throttled ? RATE_LIMITED : null
}

/* ---------- 실행 ---------- */
const items = JSON.parse(readFileSync(FILE, 'utf8'))
const force = flag('force')
const todo = items.filter((it) => force || typeof it.lat !== 'number' || typeof it.lng !== 'number')

console.log(`전체 ${items.length}건 / 조회 대상 ${todo.length}건 (동시 ${CONCURRENCY})`)
if (todo.length === 0) {
  console.log('모두 좌표가 있습니다. 다시 조회하려면 --force')
  process.exit(0)
}

const save = () => writeFileSync(FILE, `${JSON.stringify(items, null, 2)}\n`, 'utf8')

const stats = { road: 0, jibun: 0, keyword: 0, venue: 0, failed: 0, throttled: 0 }
let done = 0
let cursor = 0

async function worker() {
  while (cursor < todo.length) {
    const item = todo[cursor++]
    try {
      const hit = await geocode(item)
      if (hit === RATE_LIMITED) {
        // 좌표도 실패 표시도 남기지 않는다 — 다시 실행하면 이 행부터 이어간다
        stats.throttled++
      } else if (hit) {
        item.lat = hit.lat
        item.lng = hit.lng
        item.geocodedFrom = hit.source
        stats[hit.source]++
      } else {
        item.lat = null
        item.lng = null
        item.geocodedFrom = 'failed'
        stats.failed++
      }
    } catch (error) {
      save()
      console.error(`\n중단: ${error.message}`)
      console.error(`여기까지 ${done}건 저장했습니다. 고친 뒤 다시 실행하면 이어서 진행합니다.`)
      process.exit(1)
    }

    done++
    if (done % SAVE_EVERY === 0) {
      save()
      process.stdout.write(`\r진행 ${done}/${todo.length} (실패 ${stats.failed}, 호출 ${calls})   `)
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))
save()

const located = items.filter((it) => typeof it.lat === 'number').length
console.log(`
좌표 확보   ${located}/${items.length}건 (${((located / items.length) * 100).toFixed(1)}%)
  도로명    ${stats.road}
  지번      ${stats.jibun}
  키워드    ${stats.keyword}
  시설명    ${stats.venue}${stats.venue > 0 ? '  <- 시설 대표 좌표라 오차가 크다' : ''}
  실패      ${stats.failed}
  제한 보류  ${stats.throttled}${stats.throttled > 0 ? '  <- 초당 제한. --concurrency 를 낮춰 다시 실행하면 이어서 채운다' : ''}
카카오 호출 ${calls}회

다음 단계: npm run db:setup && npm run db:seed:restrooms`)
