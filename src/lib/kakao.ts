import type { Restaurant } from '../types/restaurant'

const APP_KEY = import.meta.env.VITE_KAKAO_MAP_APP_KEY as string | undefined
const SDK_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${APP_KEY}&libraries=services&autoload=false`
const SCRIPT_ID = 'kakao-maps-sdk'

/** 키가 없어도 앱 전체가 죽지 않도록, 지도 관련 UI에서 이 플래그로 안내 문구를 띄운다. */
export const hasKakaoKey = Boolean(APP_KEY)

export class KakaoKeyMissingError extends Error {
  constructor() {
    super('VITE_KAKAO_MAP_APP_KEY 가 설정되지 않았습니다. .env.local 을 확인해 주세요.')
    this.name = 'KakaoKeyMissingError'
  }
}

let loader: Promise<typeof kakao.maps> | null = null

/** SDK를 한 번만 주입하고, 이후 호출은 같은 Promise를 공유한다. */
export function loadKakaoMaps(): Promise<typeof kakao.maps> {
  if (!APP_KEY) return Promise.reject(new KakaoKeyMissingError())
  if (loader) return loader

  loader = new Promise<typeof kakao.maps>((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao!.maps))
      return
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    if (!existing) {
      script.id = SCRIPT_ID
      script.async = true
      script.src = SDK_URL
      document.head.appendChild(script)
    }

    script.addEventListener('load', () => {
      // autoload=false 이므로 load() 콜백 이후에야 kakao.maps 사용 가능
      window.kakao!.maps.load(() => resolve(window.kakao!.maps))
    })
    script.addEventListener('error', () => {
      loader = null // 네트워크/도메인 오류 시 재시도 가능하도록 캐시 해제
      reject(new Error('카카오맵 SDK를 불러오지 못했습니다. 앱 키와 등록된 도메인을 확인해 주세요.'))
    })
  })

  return loader
}

/** 장소 키워드 검색. 주소·좌표·카카오맵 링크를 한 번에 얻는다. */
export async function searchPlaces(
  keyword: string,
  size = 10,
): Promise<kakao.maps.services.PlaceResult[]> {
  const trimmed = keyword.trim()
  if (!trimmed) return []

  const maps = await loadKakaoMaps()
  return new Promise((resolve, reject) => {
    new maps.services.Places().keywordSearch(
      trimmed,
      (data, status) => {
        if (status === maps.services.Status.OK) resolve(data)
        else if (status === maps.services.Status.ZERO_RESULT) resolve([])
        else reject(new Error('장소 검색에 실패했습니다.'))
      },
      { size },
    )
  })
}

/** 검색 결과를 Restaurant 필드로 변환 (상호는 덮어쓰지 않고 호출부가 선택하도록 별도 반환) */
export function placeToPatch(place: kakao.maps.services.PlaceResult) {
  return {
    suggestedName: place.place_name,
    patch: {
      address: place.road_address_name || place.address_name,
      lat: Number(place.y),
      lng: Number(place.x),
      kakaoPlaceUrl: place.place_url,
    } satisfies Partial<Restaurant>,
  }
}

/** 좌표가 아직 없을 때 쓰는 카카오맵 웹 검색 링크 (SDK 없이도 동작) */
export const kakaoSearchUrl = (keyword: string) =>
  `https://map.kakao.com/?q=${encodeURIComponent(keyword)}`

/** 상세/폼에서 '주소 찾기' 기본 검색어 */
export const defaultSearchKeyword = (r: Pick<Restaurant, 'name' | 'district' | 'dong' | 'memo'>) =>
  [r.district, r.dong, r.name].filter(Boolean).join(' ').trim() || r.memo
