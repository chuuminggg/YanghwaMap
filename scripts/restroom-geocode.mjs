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

/** '서울특별시 마포구 방울내로 19' -> '서울특별시 마포구' (키워드 검색 보조용) */
const districtOf = (raw) => {
  const m = (raw ?? '').match(/^(\S+(?:시|도))\s+(\S+(?:시|군|구))/)
  return m ? `${m[1]} ${m[2]}` : ''
}

/* ---------- 카카오 호출 ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let calls = 0

async function kakao(path, query) {
  const url = `https://dapi.kakao.com/v2/local/${path}?query=${encodeURIComponent(query)}&size=1`

  for (let attempt = 0; attempt < 4; attempt++) {
    calls++
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } })

    if (response.status === 429) {
      await sleep(1000 * (attempt + 1)) // 쿼터/초당 제한 — 물러섰다 재시도
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
  return null
}

/** 도로명주소 -> 지번주소 -> '구 + 화장실명' 키워드 순으로 시도한다. */
async function geocode(item) {
  const road = cleanAddress(item.roadAddress)
  if (road) {
    const hit = await kakao('search/address.json', road)
    if (hit) return { ...hit, source: 'road' }
  }

  const jibun = cleanAddress(item.jibunAddress)
  if (jibun && jibun !== road) {
    const hit = await kakao('search/address.json', jibun)
    if (hit) return { ...hit, source: 'jibun' }
  }

  const district = districtOf(item.roadAddress || item.jibunAddress)
  if (district && item.name) {
    const hit = await kakao('search/keyword.json', `${district} ${item.name}`)
    if (hit) return { ...hit, source: 'keyword' }
  }

  return null
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

const stats = { road: 0, jibun: 0, keyword: 0, failed: 0 }
let done = 0
let cursor = 0

async function worker() {
  while (cursor < todo.length) {
    const item = todo[cursor++]
    try {
      const hit = await geocode(item)
      if (hit) {
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
  실패      ${stats.failed}
카카오 호출 ${calls}회

다음 단계: npm run db:setup && npm run db:seed:restrooms`)
