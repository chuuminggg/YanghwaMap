import { create } from 'zustand'

export type VisitFilter = 'all' | 'visited' | 'wish'

type FilterState = {
  /** null = 전체 */
  district: string | null
  dong: string | null
  /** 메뉴/업종 (식당가, 기사식당 …). 주소로 위치를 특정 못 한 항목을 찾는 통로 */
  menu: string | null
  query: string
  visit: VisitFilter
  /** 현재 위치 기준 거리순으로 볼지 */
  nearby: boolean
  /** 미터. null이면 반경 제한 없이 거리순 정렬만 한다 */
  nearbyRadius: number | null
  setDistrict: (district: string | null) => void
  setDong: (dong: string | null) => void
  setMenu: (menu: string | null) => void
  setQuery: (query: string) => void
  setVisit: (visit: VisitFilter) => void
  setNearby: (nearby: boolean) => void
  setNearbyRadius: (radius: number | null) => void
  reset: () => void
}

const initial = {
  district: null,
  dong: null,
  menu: null,
  query: '',
  visit: 'all',
  nearby: false,
  nearbyRadius: null,
} satisfies Pick<
  FilterState,
  'district' | 'dong' | 'menu' | 'query' | 'visit' | 'nearby' | 'nearbyRadius'
>

/** 필터는 세션 한정이라 persist하지 않는다. */
export const useFilterStore = create<FilterState>()((set) => ({
  ...initial,

  // 구가 바뀌면 이전 구의 동 선택은 의미가 없으므로 함께 초기화
  setDistrict: (district) => set({ district, dong: null }),
  setDong: (dong) => set({ dong }),
  setMenu: (menu) => set({ menu }),
  setQuery: (query) => set({ query }),
  setVisit: (visit) => set({ visit }),
  setNearby: (nearby) => set({ nearby }),
  setNearbyRadius: (nearbyRadius) => set({ nearbyRadius }),
  reset: () => set(initial),
}))

export type FilterSnapshot = Pick<
  FilterState,
  'district' | 'dong' | 'menu' | 'query' | 'visit' | 'nearby' | 'nearbyRadius'
>

/** 기본값에서 하나라도 벗어났는지 — 초기화 버튼 활성 여부 */
export const isFilterActive = (f: FilterSnapshot) =>
  f.district !== null ||
  f.dong !== null ||
  f.menu !== null ||
  f.query !== '' ||
  f.visit !== 'all' ||
  f.nearby
