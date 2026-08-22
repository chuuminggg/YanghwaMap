import { useCallback, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { FilterBar } from '../components/FilterBar'
import { KakaoMap, type MapMarker } from '../components/KakaoMap'
import { RestaurantMapCard } from '../components/RestaurantMapCard'
import { filterRestaurants } from '../store/selectors'
import { useFilterStore } from '../store/useFilterStore'
import { useRestaurantStore } from '../store/useRestaurantStore'
import { areaLabel, hasCoords } from '../types/restaurant'

/** 화장실 화면과 같은 지도 + 목록 구성. 마커와 카드가 선택 상태를 공유한다. */
export function MapPage() {
  const restaurants = useRestaurantStore((s) => s.restaurants)
  const district = useFilterStore((s) => s.district)
  const dong = useFilterStore((s) => s.dong)
  const menu = useFilterStore((s) => s.menu)
  const query = useFilterStore((s) => s.query)
  const visit = useFilterStore((s) => s.visit)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(
    () => filterRestaurants(restaurants, { district, dong, menu, query, visit }),
    [restaurants, district, dong, menu, query, visit],
  )

  const markers = useMemo<MapMarker[]>(
    () =>
      filtered.filter(hasCoords).map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        title: r.name,
        subtitle: [areaLabel(r), r.menu].filter(Boolean).join(' · '),
      })),
    [filtered],
  )

  // KakaoMap이 markers/onMarkerClick 변경 시 마커를 다시 그리므로 참조를 고정한다
  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(id)
    listRef.current
      ?.querySelector(`[data-restaurant-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  const missing = filtered.length - markers.length

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
        <FilterBar compact />
      </div>

      <KakaoMap
        markers={markers}
        className="min-h-0 flex-[3]"
        selectedId={selectedId}
        onMarkerClick={handleMarkerClick}
      />

      <div className="min-h-0 flex-[2] overflow-y-auto border-t border-stone-200 bg-stone-50 px-4 py-3">
        {filtered.length === 0 ? (
          <EmptyState
            title="조건에 맞는 맛집이 없습니다."
            description="필터를 초기화하거나 새로운 맛집을 추가해 보세요."
          />
        ) : (
          <ul ref={listRef} className="space-y-3">
            {filtered.map((restaurant) => (
              <li key={restaurant.id} data-restaurant-id={restaurant.id}>
                <RestaurantMapCard
                  restaurant={restaurant}
                  selected={selectedId === restaurant.id}
                  onSelect={() => setSelectedId(restaurant.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
        총 {filtered.length}곳 · 지도 표시 {markers.length}곳
        {missing > 0 && ` · 좌표 미등록 ${missing}곳은 상세에서 '주소 찾기'로 등록해 주세요.`}
      </p>
    </div>
  )
}
