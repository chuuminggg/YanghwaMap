/** 맛집 한 곳. 엑셀 원본(구역별(동) / 위치 / 상호 및 메뉴 / 참조)을 앱 모델로 확장한 형태. */
export type Restaurant = {
  id: string
  /** 상호. 엑셀 '상호 및 메뉴'에서 분리했고, 상호가 없던 행은 랜드마크로 대체돼 있다. */
  name: string
  /** 메뉴 / 업종 (백반집, 한식부페, 기사식당 …) */
  menu: string
  /** 구 — 필터 1단계 */
  district: string
  /** 동 — 필터 2단계 (없으면 빈 문자열) */
  dong: string
  /** 엑셀 '구역별(동)' 원문. 구를 특정하지 못한 행의 근거를 잃지 않기 위해 보존 */
  areaRaw: string
  /** 도로명/지번 주소 — 카카오 장소 검색으로 채운다 */
  address: string
  lat?: number
  lng?: number
  /** 카카오맵 장소 상세 페이지 링크 */
  kakaoPlaceUrl?: string
  /** 추가 메모 = 간단 위치 요약 (엑셀 '위치' 열) */
  memo: string
  /** 참조 (영업시간, 주차 등 엑셀 '참 조' 열) */
  reference: string
  visited: boolean
  /** 1~5. 미평가는 undefined */
  rating?: number
  createdAt: string
  updatedAt: string
}

/** 폼에서 다루는 입력값 — id/타임스탬프는 스토어가 채운다. */
export type RestaurantDraft = Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>

export const emptyDraft = (): RestaurantDraft => ({
  name: '',
  menu: '',
  district: '',
  dong: '',
  areaRaw: '',
  address: '',
  memo: '',
  reference: '',
  visited: true,
})

export const hasCoords = (r: Restaurant): r is Restaurant & { lat: number; lng: number } =>
  typeof r.lat === 'number' && typeof r.lng === 'number'

/** 카드/상세에서 쓰는 '구 동' 표기 */
export const areaLabel = (r: Pick<Restaurant, 'district' | 'dong'>) =>
  [r.district, r.dong].filter(Boolean).join(' ')

/** 저장된 항목을 폼 초기값으로 바꾼다 (id/타임스탬프 제외) */
export const toDraft = (r: Restaurant): RestaurantDraft => ({
  name: r.name,
  menu: r.menu,
  district: r.district,
  dong: r.dong,
  areaRaw: r.areaRaw,
  address: r.address,
  lat: r.lat,
  lng: r.lng,
  kakaoPlaceUrl: r.kakaoPlaceUrl,
  memo: r.memo,
  reference: r.reference,
  visited: r.visited,
  rating: r.rating,
})
