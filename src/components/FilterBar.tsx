import { useMemo } from 'react'
import { useRestaurantStore } from '../store/useRestaurantStore'
import { useFilterStore, type VisitFilter } from '../store/useFilterStore'
import { collectDistricts, collectDongs } from '../store/selectors'

const VISIT_LABELS: Record<VisitFilter, string> = {
  all: '전체',
  visited: '가본 곳',
  wish: '가볼 곳',
}

const chipClass = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
    active
      ? 'border-brand-500 bg-brand-500 text-white'
      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
  }`

/** 구(1단계) → 동(2단계) 칩 필터 + 검색어 + 방문 여부 */
export function FilterBar({ compact = false }: { compact?: boolean }) {
  const restaurants = useRestaurantStore((s) => s.restaurants)
  const district = useFilterStore((s) => s.district)
  const dong = useFilterStore((s) => s.dong)
  const query = useFilterStore((s) => s.query)
  const visit = useFilterStore((s) => s.visit)
  const setDistrict = useFilterStore((s) => s.setDistrict)
  const setDong = useFilterStore((s) => s.setDong)
  const setQuery = useFilterStore((s) => s.setQuery)
  const setVisit = useFilterStore((s) => s.setVisit)
  const reset = useFilterStore((s) => s.reset)

  const districts = useMemo(() => collectDistricts(restaurants), [restaurants])
  const dongs = useMemo(() => collectDongs(restaurants, district), [restaurants, district])
  const isFiltered = district !== null || dong !== null || query !== '' || visit !== 'all'

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상호, 메뉴, 메모 검색"
            className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          {isFiltered && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500 hover:bg-stone-50"
            >
              초기화
            </button>
          )}
        </div>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => setDistrict(null)}
          className={chipClass(district === null)}
        >
          전체 <span className="text-xs opacity-70">{restaurants.length}</span>
        </button>
        {districts.map((item) => (
          <button
            key={item.value}
            type="button"
            // 이미 선택된 구를 다시 누르면 해제
            onClick={() => setDistrict(district === item.value ? null : item.value)}
            className={chipClass(district === item.value)}
          >
            {item.value} <span className="text-xs opacity-70">{item.count}</span>
          </button>
        ))}
      </div>

      {district && dongs.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button type="button" onClick={() => setDong(null)} className={chipClass(dong === null)}>
            {district} 전체
          </button>
          {dongs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setDong(dong === item.value ? null : item.value)}
              className={chipClass(dong === item.value)}
            >
              {item.value} <span className="text-xs opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
      )}

      {!compact && (
        <div className="flex gap-2">
          {(Object.keys(VISIT_LABELS) as VisitFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setVisit(key)}
              className={chipClass(visit === key)}
            >
              {VISIT_LABELS[key]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
