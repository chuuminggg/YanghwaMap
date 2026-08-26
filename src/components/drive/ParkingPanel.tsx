import { useCallback, useMemo, useState } from 'react'
import { useAsyncQuery } from '../../hooks/useAsyncQuery'
import type { PositionState } from '../../hooks/useCurrentPosition'
import { listNearbyParking } from '../../lib/api'
import { formatDistance, type LatLng } from '../../lib/geo'
import { kakaoSearchUrl } from '../../lib/kakao'
import { basicFee, weekdayHours, type ParkingLot, type ParkingResult } from '../../types/drive'
import type { MapMarker } from '../KakaoMap'
import { LocateButton, PositionNote, RadiusChips } from './controls'
import { NearbyLayout, PanelBody } from './NearbyLayout'
import { chipClass } from './styles'

const RADIUS_OPTIONS = [500, 1_000, 1_500, 3_000] as const
const DEFAULT_RADIUS = 1_500

const NO_ITEMS: ParkingLot[] = []
const tagClass = 'shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600'

/** 현재 위치 주변 공영주차장을 거리순으로. 민영 포함으로 넓힐 수 있다. */
export function ParkingPanel({
  origin,
  position,
  onRefreshPosition,
}: {
  origin: LatLng | null
  position: PositionState
  onRefreshPosition: () => void
}) {
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS)
  const [publicOnly, setPublicOnly] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const key = origin
    ? `parking:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)},${radius},${publicOnly}`
    : null

  const { state } = useAsyncQuery<ParkingResult>(
    key,
    () =>
      listNearbyParking({ lat: origin!.lat, lng: origin!.lng, radius, limit: 40, publicOnly }),
    '주차장 목록을 불러오지 못했습니다.',
  )

  const items = state.status === 'ready' ? state.data.items : NO_ITEMS

  const markers = useMemo<MapMarker[]>(
    () =>
      items.map((lot) => ({
        id: lot.id,
        lat: lot.lat,
        lng: lot.lng,
        title: lot.name,
        subtitle: [formatDistance(lot.distanceMeters), basicFee(lot)].filter(Boolean).join(' · '),
      })),
    [items],
  )

  const handleMarkerClick = useCallback((id: string) => setSelectedId(id), [])

  return (
    <NearbyLayout
      markers={markers}
      origin={origin}
      selectedId={selectedId}
      onMarkerClick={handleMarkerClick}
      footer="지자체가 올린 표준데이터라 실시간 잔여 면수·만차 여부는 알 수 없습니다. 요금·운영시간은 현장 안내를 우선하세요."
      controls={
        <>
          <div className="flex items-center gap-2">
            <RadiusChips options={RADIUS_OPTIONS} value={radius} onChange={setRadius} />
            <LocateButton position={position} onRefresh={onRefreshPosition} />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPublicOnly(true)}
              className={chipClass(publicOnly)}
            >
              공영만
            </button>
            <button
              type="button"
              onClick={() => setPublicOnly(false)}
              className={chipClass(!publicOnly)}
            >
              민영 포함
            </button>
          </div>
          <PositionNote position={position}>
            {state.status === 'ready'
              ? `${state.data.region} · 반경 ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 안 ${state.data.total}곳`
              : `반경 ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 안 공영주차장`}
          </PositionNote>
        </>
      }
    >
      <PanelBody
        status={state.status}
        message={state.status === 'error' ? state.message : undefined}
        count={items.length}
        loadingText="근처 주차장을 찾는 중…"
        errorTitle="주차장 목록을 불러오지 못했습니다."
        emptyTitle="반경 안에 주차장이 없습니다."
        emptyDescription={
          publicOnly ? '반경을 넓히거나 민영 포함으로 바꿔 보세요.' : '반경을 넓혀 보세요.'
        }
      >
        <ul className="space-y-3">
          {items.map((lot) => (
            <li key={lot.id}>
              <div
                className={`rounded-xl border bg-white p-4 transition ${
                  selectedId === lot.id
                    ? 'border-brand-500 ring-1 ring-brand-500'
                    : 'border-stone-200 hover:border-brand-300 hover:shadow-sm'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(lot.id)}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-stone-900">{lot.name}</h3>
                      <p className="mt-0.5 truncate text-sm text-stone-500">
                        {[lot.category, lot.type, weekdayHours(lot)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-brand-600">
                      {formatDistance(lot.distanceMeters)}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs text-stone-500">{lot.address}</p>
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {basicFee(lot) && <span className={tagClass}>{basicFee(lot)}</span>}
                  {lot.capacity !== null && <span className={tagClass}>{lot.capacity}면</span>}
                  {lot.accessible && <span className={tagClass}>장애인구역</span>}
                  {lot.monthlyCharge ? (
                    <span className={tagClass}>월 {lot.monthlyCharge.toLocaleString('ko-KR')}원</span>
                  ) : null}
                  <a
                    href={kakaoSearchUrl(`${lot.address} ${lot.name}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto shrink-0 text-xs text-stone-400 underline-offset-2 hover:text-brand-600 hover:underline"
                  >
                    카카오맵에서 열기
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </PanelBody>
    </NearbyLayout>
  )
}
