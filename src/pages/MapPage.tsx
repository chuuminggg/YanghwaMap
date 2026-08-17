import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { FilterBar } from '../components/FilterBar'
import { KakaoMap, type MapMarker } from '../components/KakaoMap'
import { filterRestaurants } from '../store/selectors'
import { useFilterStore } from '../store/useFilterStore'
import { useRestaurantStore } from '../store/useRestaurantStore'
import { areaLabel, hasCoords } from '../types/restaurant'

export function MapPage() {
  const navigate = useNavigate()
  const restaurants = useRestaurantStore((s) => s.restaurants)
  const district = useFilterStore((s) => s.district)
  const dong = useFilterStore((s) => s.dong)
  const query = useFilterStore((s) => s.query)
  const visit = useFilterStore((s) => s.visit)

  const filtered = useMemo(
    () => filterRestaurants(restaurants, { district, dong, query, visit }),
    [restaurants, district, dong, query, visit],
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
  const handleMarkerClick = useCallback((id: string) => navigate(`/${id}`), [navigate])

  const missing = filtered.length - markers.length

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
        <FilterBar compact />
      </div>

      <KakaoMap markers={markers} className="min-h-0 flex-1" onMarkerClick={handleMarkerClick} />

      <p className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
        지도 표시 {markers.length}곳
        {missing > 0 && ` · 좌표 미등록 ${missing}곳은 상세에서 '주소 찾기'로 등록해 주세요.`}
      </p>
    </div>
  )
}
