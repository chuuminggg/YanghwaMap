import { useCallback, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { KakaoMap, type MapMarker } from '../components/KakaoMap'
import { RestroomCard } from '../components/RestroomCard'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { useNearbyRestrooms } from '../hooks/useNearbyRestrooms'
import { formatDistance } from '../lib/geo'
import { openingHours, type NearbyRestroom } from '../types/restroom'

const RADIUS_OPTIONS = [300, 500, 1000] as const
type Radius = (typeof RADIUS_OPTIONS)[number]

/** 로딩·에러일 때 매 렌더 새 배열을 만들지 않도록 고정한다 (KakaoMap이 markers 참조로 다시 그린다) */
const NO_ITEMS: NearbyRestroom[] = []

const chipClass = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
    active
      ? 'border-brand-500 bg-brand-500 text-white'
      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
  }`

/** 현재 위치 기준으로 근처 공중화장실을 지도 + 거리순 목록으로 보여 준다. */
export function RestroomPage() {
  const { position, refresh } = useCurrentPosition()
  const [radius, setRadius] = useState<Radius>(500)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const origin = position.status === 'locating' ? null : position.origin
  const nearby = useNearbyRestrooms(origin, radius)
  const items = nearby.status === 'ready' ? nearby.items : NO_ITEMS

  const markers = useMemo<MapMarker[]>(
    () =>
      items.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        title: r.name,
        subtitle: [formatDistance(r.distanceMeters), openingHours(r)].filter(Boolean).join(' · '),
      })),
    [items],
  )

  // KakaoMap이 markers/onMarkerClick 변경 시 마커를 다시 그리므로 참조를 고정한다
  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(id)
    listRef.current
      ?.querySelector(`[data-restroom-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="space-y-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {RADIUS_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRadius(value)}
                className={chipClass(radius === value)}
              >
                {value < 1000 ? `${value}m` : `${value / 1000}km`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={position.status === 'locating'}
            className="ml-auto shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 transition hover:border-stone-300 disabled:opacity-50"
          >
            {position.status === 'locating' ? '위치 확인 중…' : '📍 현재 위치'}
          </button>
        </div>

        <p className="text-xs text-stone-500">
          {position.status === 'fallback'
            ? position.reason
            : position.status === 'locating'
              ? '위치를 확인하는 중입니다…'
              : `내 위치 기준 · 반경 ${radius < 1000 ? `${radius}m` : `${radius / 1000}km`} 안 ${items.length}곳`}
        </p>
      </div>

      <KakaoMap
        markers={markers}
        className="min-h-0 flex-[3]"
        origin={origin}
        selectedId={selectedId}
        onMarkerClick={handleMarkerClick}
      />

      <div className="min-h-0 flex-[2] overflow-y-auto border-t border-stone-200 bg-stone-50 px-4 py-3">
        {nearby.status === 'loading' ? (
          <p className="py-8 text-center text-sm text-stone-400">근처 화장실을 찾는 중…</p>
        ) : nearby.status === 'error' ? (
          <EmptyState title="화장실 목록을 불러오지 못했습니다." description={nearby.message} />
        ) : items.length === 0 ? (
          <EmptyState
            title="반경 안에 등록된 화장실이 없습니다."
            description="반경을 넓히거나 현재 위치를 다시 잡아 보세요."
          />
        ) : (
          <ul ref={listRef} className="space-y-3">
            {items.map((restroom) => (
              <li key={restroom.id} data-restroom-id={restroom.id}>
                <RestroomCard
                  restroom={restroom}
                  selected={selectedId === restroom.id}
                  onSelect={() => setSelectedId(restroom.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
        공공데이터 기준이라 실시간 개방·점검 상태는 보장되지 않습니다. 개방시간은 현장 안내를 우선하세요.
      </p>
    </div>
  )
}
