import { useCallback, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { KakaoMap, type MapMarker } from '../components/KakaoMap'
import { RestroomCard } from '../components/RestroomCard'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { useDistrictRestrooms, useRestroomDistricts } from '../hooks/useDistrictRestrooms'
import { useNearbyRestrooms } from '../hooks/useNearbyRestrooms'
import { formatDistance } from '../lib/geo'
import {
  hasCoords,
  isNearbyRestroom,
  openingHours,
  type NearbyRestroom,
  type Restroom,
} from '../types/restroom'

const RADIUS_OPTIONS = [300, 500, 1000] as const
type Radius = (typeof RADIUS_OPTIONS)[number]
type Mode = 'district' | 'nearby'

/** 로딩·에러일 때 매 렌더 새 배열을 만들지 않도록 고정한다 (KakaoMap이 markers 참조로 다시 그린다) */
const NO_ITEMS: (Restroom | NearbyRestroom)[] = []

const radiusLabel = (meters: number) => (meters < 1000 ? `${meters}m` : `${meters / 1000}km`)

const chipClass = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
    active
      ? 'border-brand-500 bg-brand-500 text-white'
      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
  }`

const modeClass = (active: boolean) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
  }`

/** 공중화장실을 자치구별(이름순) 또는 현재 위치 기준(거리순)으로 보여 준다. */
export function RestroomPage() {
  const [mode, setMode] = useState<Mode>('district')
  const [radius, setRadius] = useState<Radius>(500)
  const [district, setDistrict] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const { position, refresh } = useCurrentPosition()
  const origin = position.status === 'locating' ? null : position.origin

  // 두 모드 모두 훅을 부르되, 활성 모드가 아니면 인자를 null 로 넘겨 요청 자체를 막는다
  const nearby = useNearbyRestrooms(mode === 'nearby' ? origin : null, radius)
  const byDistrict = useDistrictRestrooms(mode === 'district' ? district : null)
  const { districts, error: districtsError } = useRestroomDistricts()

  const active = mode === 'nearby' ? nearby : byDistrict
  const items: (Restroom | NearbyRestroom)[] = active.status === 'ready' ? active.items : NO_ITEMS

  // 좌표가 없는 항목은 지도에 찍을 수 없다 — 지오코딩 전에는 대부분이 여기 해당한다
  const markers = useMemo<MapMarker[]>(
    () =>
      items.filter(hasCoords).map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        title: r.name,
        subtitle: [
          isNearbyRestroom(r) ? formatDistance(r.distanceMeters) : r.district,
          openingHours(r),
        ]
          .filter(Boolean)
          .join(' · '),
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

  const switchMode = (next: Mode) => {
    setMode(next)
    setSelectedId(null)
  }

  const missing = items.length - markers.length

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="space-y-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex rounded-lg bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => switchMode('district')}
            className={modeClass(mode === 'district')}
          >
            지역구
          </button>
          <button
            type="button"
            onClick={() => switchMode('nearby')}
            className={modeClass(mode === 'nearby')}
          >
            내 주변
          </button>
        </div>

        {mode === 'district' ? (
          <>
            <div className="-mx-4 overflow-x-auto px-4">
              <div className="flex gap-1.5">
                {districts.map(({ district: name, total }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setDistrict(name)
                      setSelectedId(null)
                    }}
                    className={chipClass(district === name)}
                  >
                    {name} {total}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-stone-500">
              {districtsError ??
                (district
                  ? `${district} ${items.length}곳${missing > 0 ? ` · 좌표 미등록 ${missing}곳은 지도에 표시되지 않습니다` : ''}`
                  : '자치구를 골라 주세요.')}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                {RADIUS_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRadius(value)}
                    className={chipClass(radius === value)}
                  >
                    {radiusLabel(value)}
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
                  : `내 위치 기준 · 반경 ${radiusLabel(radius)} 안 ${items.length}곳`}
            </p>
          </>
        )}
      </div>

      <KakaoMap
        markers={markers}
        className="min-h-0 flex-[3]"
        origin={mode === 'nearby' ? origin : null}
        selectedId={selectedId}
        onMarkerClick={handleMarkerClick}
      />

      <div className="min-h-0 flex-[2] overflow-y-auto border-t border-stone-200 bg-stone-50 px-4 py-3">
        {active.status === 'idle' ? (
          <EmptyState
            title="자치구를 골라 주세요."
            description="위 칩에서 구를 고르면 그 구의 화장실을 이름순으로 보여 줍니다."
          />
        ) : active.status === 'loading' ? (
          <p className="py-8 text-center text-sm text-stone-400">
            {mode === 'nearby' ? '근처 화장실을 찾는 중…' : '목록을 불러오는 중…'}
          </p>
        ) : active.status === 'error' ? (
          <EmptyState title="화장실 목록을 불러오지 못했습니다." description={active.message} />
        ) : items.length === 0 ? (
          <EmptyState
            title={
              mode === 'nearby' ? '반경 안에 등록된 화장실이 없습니다.' : '등록된 화장실이 없습니다.'
            }
            description={
              mode === 'nearby'
                ? '반경을 넓히거나 현재 위치를 다시 잡아 보세요.'
                : '다른 자치구를 골라 보세요.'
            }
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
