import { create } from 'zustand'

export type VisitFilter = 'all' | 'visited' | 'wish'

type FilterState = {
  /** null = 전체 */
  district: string | null
  dong: string | null
  query: string
  visit: VisitFilter
  setDistrict: (district: string | null) => void
  setDong: (dong: string | null) => void
  setQuery: (query: string) => void
  setVisit: (visit: VisitFilter) => void
  reset: () => void
}

/** 필터는 세션 한정이라 persist하지 않는다. */
export const useFilterStore = create<FilterState>()((set) => ({
  district: null,
  dong: null,
  query: '',
  visit: 'all',

  // 구가 바뀌면 이전 구의 동 선택은 의미가 없으므로 함께 초기화
  setDistrict: (district) => set({ district, dong: null }),
  setDong: (dong) => set({ dong }),
  setQuery: (query) => set({ query }),
  setVisit: (visit) => set({ visit }),
  reset: () => set({ district: null, dong: null, query: '', visit: 'all' }),
}))
