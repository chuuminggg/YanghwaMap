import { useCallback, useMemo, useState } from 'react'
import { useAsyncQuery } from '../../hooks/useAsyncQuery'
import type { PositionState } from '../../hooks/useCurrentPosition'
import { listNearbyChargers } from '../../lib/api'
import { formatDistance, type LatLng } from '../../lib/geo'
import { kakaoSearchUrl } from '../../lib/kakao'
import {
  connectorSummary,
  hasFastCharger,
  type EvStation,
  type EvStationResult,
} from '../../types/drive'
import type { MapMarker } from '../KakaoMap'
import { LocateButton, PositionNote, RadiusChips } from './controls'
import { NearbyLayout, PanelBody } from './NearbyLayout'
import { chipClass } from './styles'

const RADIUS_OPTIONS = [1_000, 2_000, 3_000, 5_000] as const
const DEFAULT_RADIUS = 2_000

const NO_ITEMS: EvStation[] = []
const tagClass = 'shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600'

/** 충전 가능 대수를 눈에 띄게 — 급하게 찾는 값이다. 상태를 못 받았으면 회색으로 낮춘다. */
const availableTone = (count: number, live: boolean) =>
  !live
    ? 'bg-stone-100 text-stone-500'
    : count > 0
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-red-50 text-red-700'

export function ChargerPanel({
  origin,
  position,
  onRefreshPosition,
}: {
  origin: LatLng | null
  position: PositionState
  onRefreshPosition: () => void
}) {
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const key = origin
    ? `chargers:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)},${radius},${availableOnly}`
    : null

  const { state } = useAsyncQuery<EvStationResult>(
    key,
    () =>
      listNearbyChargers({ lat: origin!.lat, lng: origin!.lng, radius, limit: 40, availableOnly }),
    '충전소 목록을 불러오지 못했습니다.',
  )

  const items = state.status === 'ready' ? state.data.items : NO_ITEMS
  const live = state.status === 'ready' && state.data.liveStatus

  const markers = useMemo<MapMarker[]>(
    () =>
      items.map((station) => ({
        id: station.id,
        lat: station.lat,
        lng: station.lng,
        title: station.name,
        subtitle: `${formatDistance(station.distanceMeters)} · 충전기 ${station.chargers.length}대 중 ${station.availableCount}대 대기`,
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
      footer={
        live
          ? '환경부 실시간 상태입니다. 도착까지 걸리는 사이에 다른 차가 꽂을 수 있습니다.'
          : '실시간 상태를 받지 못해 충전기 정보에 딸려 온 값을 보여 줍니다. 현재 상태와 다를 수 있습니다.'
      }
      controls={
        <>
          <div className="flex items-center gap-2">
            <RadiusChips options={RADIUS_OPTIONS} value={radius} onChange={setRadius} />
            <LocateButton position={position} onRefresh={onRefreshPosition} />
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setAvailableOnly(false)} className={chipClass(!availableOnly)}>
              전체
            </button>
            <button type="button" onClick={() => setAvailableOnly(true)} className={chipClass(availableOnly)}>
              충전 가능만
            </button>
          </div>
          <PositionNote position={position}>
            {state.status === 'ready'
              ? `${state.data.region} · 반경 ${radius / 1000}km 안 충전소 ${state.data.total}곳`
              : `반경 ${radius / 1000}km 안 전기차 충전소`}
          </PositionNote>
        </>
      }
    >
      <PanelBody
        status={state.status}
        message={state.status === 'error' ? state.message : undefined}
        count={items.length}
        loadingText="근처 충전소를 찾는 중…"
        errorTitle="충전소 목록을 불러오지 못했습니다."
        emptyTitle={availableOnly ? '지금 충전 가능한 곳이 없습니다.' : '반경 안에 충전소가 없습니다.'}
        emptyDescription={
          availableOnly ? '전체로 바꾸거나 반경을 넓혀 보세요.' : '반경을 넓혀 보세요.'
        }
      >
        <ul className="space-y-3">
          {items.map((station) => (
            <li key={station.id}>
              <div
                className={`rounded-xl border bg-white p-4 transition ${
                  selectedId === station.id
                    ? 'border-brand-500 ring-1 ring-brand-500'
                    : 'border-stone-200 hover:border-brand-300 hover:shadow-sm'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(station.id)}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-stone-900">{station.name}</h3>
                      <p className="mt-0.5 truncate text-sm text-stone-500">
                        {[station.operator, station.location || station.useTime]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-brand-600">
                        {formatDistance(station.distanceMeters)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${availableTone(station.availableCount, live)}`}
                      >
                        {station.availableCount}/{station.chargers.length}대
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 truncate text-xs text-stone-500">{station.address}</p>
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {hasFastCharger(station) && (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
                      급속
                    </span>
                  )}
                  {connectorSummary(station) && (
                    <span className={tagClass}>{connectorSummary(station)}</span>
                  )}
                  {station.parkingFree && <span className={tagClass}>주차무료</span>}
                  {station.limited && (
                    <span
                      className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                      title={station.limitDetail}
                    >
                      이용제한
                    </span>
                  )}
                  <a
                    href={kakaoSearchUrl(`${station.address} ${station.name}`)}
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
