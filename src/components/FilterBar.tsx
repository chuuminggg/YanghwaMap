import { useMemo, useState } from 'react'
import { useRestaurantStore } from '../store/useRestaurantStore'
import { isFilterActive, useFilterStore, type VisitFilter } from '../store/useFilterStore'
import { collectDistricts, collectDongs, collectMenus } from '../store/selectors'

const VISIT_LABELS: Record<VisitFilter, string> = {
  all: '전체',
  visited: '가본 곳',
  wish: '가볼 곳',
}

type Tab = 'area' | 'menu' | 'nearby'

/** null = 반경 제한 없이 거리순 정렬만 */
const RADIUS_OPTIONS: { label: string; value: number | null }[] = [
  { label: '전체', value: null },
  { label: '1km', value: 1000 },
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
]

const chipClass = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
    active
      ? 'border-brand-500 bg-brand-500 text-white'
      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
  }`

const tabClass = (active: boolean) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
  }`

/**
 * 지역(구→동) / 메뉴 / 내 주변 탭 칩 필터 + 검색어 + 방문 여부
 *
 * '내 주변'은 현재 위치가 있어야 의미가 있어 지도 화면에서만 켠다(showNearby).
 * 정렬 자체는 위치를 아는 호출부가 맡고, 여기서는 상태만 바꾼다.
 */
export function FilterBar({
  compact = false,
  showNearby = false,
}: {
  compact?: boolean
  showNearby?: boolean
}) {
  const restaurants = useRestaurantStore((s) => s.restaurants)
  const district = useFilterStore((s) => s.district)
  const dong = useFilterStore((s) => s.dong)
  const menu = useFilterStore((s) => s.menu)
  const query = useFilterStore((s) => s.query)
  const visit = useFilterStore((s) => s.visit)
  const nearby = useFilterStore((s) => s.nearby)
  const nearbyRadius = useFilterStore((s) => s.nearbyRadius)
  const setDistrict = useFilterStore((s) => s.setDistrict)
  const setDong = useFilterStore((s) => s.setDong)
  const setMenu = useFilterStore((s) => s.setMenu)
  const setQuery = useFilterStore((s) => s.setQuery)
  const setVisit = useFilterStore((s) => s.setVisit)
  const setNearby = useFilterStore((s) => s.setNearby)
  const setNearbyRadius = useFilterStore((s) => s.setNearbyRadius)
  const reset = useFilterStore((s) => s.reset)

  const [tab, setTab] = useState<Tab>('area')

  const districts = useMemo(() => collectDistricts(restaurants), [restaurants])
  const dongs = useMemo(() => collectDongs(restaurants, district), [restaurants, district])
  // 주소를 특정하지 못해 '식당가', '기사식당'으로만 남은 항목도 여기서 찾을 수 있다
  const menus = useMemo(() => collectMenus(restaurants), [restaurants])
  const isFiltered = isFilterActive({ district, dong, menu, query, visit, nearby, nearbyRadius })

  const resetButton = (
    <button
      type="button"
      onClick={() => {
        reset()
        setTab('area')
      }}
      disabled={!isFiltered}
      className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-500 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
    >
      필터 초기화
    </button>
  )

  return (
    <div className="space-y-3">
      {!compact && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상호, 메뉴, 메모 검색"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      )}

      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-lg bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => {
              setTab('area')
              setNearby(false)
            }}
            className={tabClass(tab === 'area')}
          >
            지역
            {(district || dong) && <span className="ml-1 text-brand-500">•</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('menu')
              setNearby(false)
            }}
            className={tabClass(tab === 'menu')}
          >
            메뉴
            {menu && <span className="ml-1 text-brand-500">•</span>}
          </button>
          {showNearby && (
            <button
              type="button"
              onClick={() => {
                setTab('nearby')
                setNearby(true)
              }}
              className={tabClass(tab === 'nearby')}
            >
              내 주변
              {nearby && <span className="ml-1 text-brand-500">•</span>}
            </button>
          )}
        </div>
        {resetButton}
      </div>

      {tab === 'nearby' ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {RADIUS_OPTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setNearbyRadius(item.value)}
              className={chipClass(nearbyRadius === item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : tab === 'area' ? (
        <>
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
              <button
                type="button"
                onClick={() => setDong(null)}
                className={chipClass(dong === null)}
              >
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
        </>
      ) : (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button type="button" onClick={() => setMenu(null)} className={chipClass(menu === null)}>
            전체 <span className="text-xs opacity-70">{restaurants.length}</span>
          </button>
          {menus.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMenu(menu === item.value ? null : item.value)}
              className={chipClass(menu === item.value)}
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
