import { useCallback, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { FilterBar } from '../components/FilterBar'
import { KakaoMap, type MapMarker } from '../components/KakaoMap'
import { RestaurantMapCard } from '../components/RestaurantMapCard'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { formatDistance } from '../lib/geo'
import { filterRestaurants, sortByDistance } from '../store/selectors'
import { useFilterStore } from '../store/useFilterStore'
import { useRestaurantStore } from '../store/useRestaurantStore'
import { areaLabel, hasCoords, type Restaurant } from '../types/restaurant'

type Row = { restaurant: Restaurant; distanceMeters?: number }

/** 화장실 화면과 같은 지도 + 목록 구성. 마커와 카드가 선택 상태를 공유한다. */
export function MapPage() {
  const restaurants = useRestaurantStore((s) => s.restaurants)
  const district = useFilterStore((s) => s.district)
  const dong = useFilterStore((s) => s.dong)
  const menu = useFilterStore((s) => s.menu)
  const query = useFilterStore((s) => s.query)
  const visit = useFilterStore((s) => s.visit)
  const nearby = useFilterStore((s) => s.nearby)
  const nearbyRadius = useFilterStore((s) => s.nearbyRadius)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // '내 주변'을 켤 때만 위치를 잡는다
  const { position, refresh } = useCurrentPosition({ enabled: nearby })
  const origin = position.status === 'locating' ? null : position.origin

  const filtered = useMemo(
    () => filterRestaurants(restaurants, { district, dong, menu, query, visit }),
    [restaurants, district, dong, menu, query, visit],
  )

  /**
   * 거리순일 때는 좌표가 있는 곳만 정렬해 앞에 두고, 좌표가 없는 곳은 뒤에 따로 붙인다.
   * 거리를 모르는 항목을 0으로 두면 가장 가까운 것처럼 보여 사용자를 잘못 이끈다.
   */
  const { rows, unlocated } = useMemo<{ rows: Row[]; unlocated: Restaurant[] }>(() => {
    if (!nearby || !origin) {
      return { rows: filtered.map((restaurant) => ({ restaurant })), unlocated: [] }
    }

    const sorted = sortByDistance(filtered, origin, nearbyRadius)
    return {
      rows: sorted.located.map((item) => ({ restaurant: item, distanceMeters: item.distanceMeters })),
      unlocated: sorted.unlocated,
    }
  }, [filtered, nearby, origin, nearbyRadius])

  const markers = useMemo<MapMarker[]>(
    () =>
      rows.flatMap(({ restaurant, distanceMeters }) =>
        hasCoords(restaurant)
          ? [
              {
                id: restaurant.id,
                lat: restaurant.lat,
                lng: restaurant.lng,
                title: restaurant.name,
                subtitle: [
                  distanceMeters !== undefined ? formatDistance(distanceMeters) : areaLabel(restaurant),
                  restaurant.menu,
                ]
                  .filter(Boolean)
                  .join(' · '),
              },
            ]
          : [],
      ),
    [rows],
  )

  // KakaoMap이 markers/onMarkerClick 변경 시 마커를 다시 그리므로 참조를 고정한다
  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(id)
    listRef.current
      ?.querySelector(`[data-restaurant-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  const shown = rows.length + unlocated.length
  const missing = shown - markers.length

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="space-y-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <FilterBar compact showNearby />
        {nearby && (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-stone-500">
              {position.status === 'locating'
                ? '위치를 확인하는 중입니다…'
                : position.status === 'fallback'
                  ? position.reason
                  : `내 위치 기준 · 가까운 순 ${rows.length}곳`}
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={position.status === 'locating'}
              className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 transition hover:border-stone-300 disabled:opacity-50"
            >
              📍 현재 위치
            </button>
          </div>
        )}
      </div>

      <KakaoMap
        markers={markers}
        className="min-h-0 flex-[3]"
        origin={nearby ? origin : null}
        selectedId={selectedId}
        onMarkerClick={handleMarkerClick}
      />

      <div className="min-h-0 flex-[2] overflow-y-auto border-t border-stone-200 bg-stone-50 px-4 py-3">
        {shown === 0 ? (
          <EmptyState
            title={nearby ? '반경 안에 맛집이 없습니다.' : '조건에 맞는 맛집이 없습니다.'}
            description={
              nearby
                ? '반경을 넓히거나 현재 위치를 다시 잡아 보세요.'
                : '필터를 초기화하거나 새로운 맛집을 추가해 보세요.'
            }
          />
        ) : (
          <>
            <ul ref={listRef} className="space-y-3">
              {rows.map(({ restaurant, distanceMeters }) => (
                <li key={restaurant.id} data-restaurant-id={restaurant.id}>
                  <RestaurantMapCard
                    restaurant={restaurant}
                    selected={selectedId === restaurant.id}
                    onSelect={() => setSelectedId(restaurant.id)}
                    distanceMeters={distanceMeters}
                  />
                </li>
              ))}
            </ul>

            {unlocated.length > 0 && (
              <>
                <p className="mt-5 mb-2 text-xs text-stone-400">
                  위치 미등록 {unlocated.length}곳 — 거리를 알 수 없어 아래에 따로 둡니다
                </p>
                <ul className="space-y-3">
                  {unlocated.map((restaurant) => (
                    <li key={restaurant.id}>
                      <RestaurantMapCard restaurant={restaurant} selected={false} onSelect={() => {}} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <p className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
        총 {shown}곳 · 지도 표시 {markers.length}곳
        {missing > 0 && ` · 좌표 미등록 ${missing}곳은 상세에서 '주소 찾기'로 등록해 주세요.`}
      </p>
    </div>
  )
}
