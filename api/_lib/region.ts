import { InvalidInputError } from './db.js'
import { MissingKakaoKeyError } from './geocode.js'
import { readKey, UpstreamError } from './upstream.js'

/**
 * 좌표 → 행정구역. 공공데이터 API 상당수가 반경 검색을 지원하지 않고
 * 시도/시군구로만 걸러 주기 때문에, 브라우저가 준 좌표를 먼저 구역 이름·코드로 바꿔야 한다.
 *   공영주차장 표준데이터: 주소 문자열로 거른다 ('서울특별시 마포구')
 *   전기차 충전소:        zcode(시도 2자리) / zscode(시군구 5자리) 코드로 거른다
 *
 * 카카오 좌표→행정구역 API를 쓴다. 서버에만 있는 KAKAO_REST_API_KEY 를 그대로 재사용하므로
 * 화장실 좌표 채우기가 동작하는 환경이면 여기도 추가 설정 없이 동작한다.
 */

export type Region = {
  /** '서울특별시' */
  sido: string
  /** '마포구'. 세종처럼 시군구가 없는 곳은 빈 문자열이다. */
  sigungu: string
  /** 법정동 코드 10자리 */
  code: string
  /** 시도 코드 2자리 — 전기차 충전소 API의 zcode */
  zcode: string
  /** 시군구 코드 5자리 — 전기차 충전소 API의 zscode */
  zscode: string
  /** '서울특별시 마포구' — 주소로 거르는 API에 넘길 힌트 */
  addressHint: string
}

type Document = {
  region_type: 'B' | 'H'
  code: string
  region_1depth_name: string
  region_2depth_name: string
}

export async function resolveRegion(lat: number, lng: number): Promise<Region> {
  const key = readKey('KAKAO_REST_API_KEY')
  if (!key) throw new MissingKakaoKeyError()

  const url =
    'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json' +
    `?x=${encodeURIComponent(String(lng))}&y=${encodeURIComponent(String(lat))}`

  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
  if (response.status === 401 || response.status === 403) {
    throw new InvalidInputError(
      `카카오 인증에 실패했습니다 (HTTP ${response.status}). REST API 키와 카카오맵/로컬 API 사용 설정을 확인해 주세요.`,
    )
  }
  if (!response.ok) throw new UpstreamError('카카오 로컬', '행정구역을 확인하지 못했습니다.')

  const body = (await response.json()) as { documents?: Document[] }
  // 'B'(법정동)의 code 가 행정표준코드라 zcode/zscode 를 그대로 잘라 쓸 수 있다.
  // 'H'(행정동) 코드는 체계가 달라 충전소 API가 받지 않는다.
  const doc = body.documents?.find((d) => d.region_type === 'B') ?? body.documents?.[0]
  if (!doc) {
    throw new InvalidInputError('현재 위치의 행정구역을 찾지 못했습니다. 국내 좌표인지 확인해 주세요.')
  }

  const sigungu = doc.region_2depth_name ?? ''
  return {
    sido: doc.region_1depth_name,
    sigungu,
    code: doc.code,
    zcode: doc.code.slice(0, 2),
    zscode: doc.code.slice(0, 5),
    addressHint: [doc.region_1depth_name, sigungu].filter(Boolean).join(' '),
  }
}
