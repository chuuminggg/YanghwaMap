import { useCallback, useMemo, useState } from 'react'
import { useAsyncQuery } from '../../hooks/useAsyncQuery'
import type { PositionState } from '../../hooks/useCurrentPosition'
import { listCheapGas } from '../../lib/api'
import { formatDistance, type LatLng } from '../../lib/geo'
import { kakaoSearchUrl } from '../../lib/kakao'
import {
  GAS_PRODUCTS,
  gasHasCoords,
  priceGap,
  type GasResult,
  type GasStation,
} from '../../types/drive'
import type { MapMarker } from '../KakaoMap'
import { LocateButton, PositionNote, RadiusChips } from './controls'
import { NearbyLayout, PanelBody } from './NearbyLayout'
import { chipClass } from './styles'

const RADIUS_OPTIONS = [1_000, 3_000, 5_000] as const
const DEFAULT_RADIUS = 3_000

const NO_ITEMS: GasStation[] = []
const tagClass = 'shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600'

/** 현재 위치 주변 주유소를 가격순으로. 최저가와의 차이를 함께 보여 준다. */
export function GasPanel({
  origin,
  position,
  onRefreshPosition,
}: {
  origin: LatLng | null
  position: PositionState
  onRefreshPosition: () => void
}) {
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS)
  const [product, setProduct] = useState<string>('B027')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const key = origin
    ? `gas:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)},${radius},${product}`
    : null

  const { state } = useAsyncQuery<GasResult>(
    key,
    () => listCheapGas({ lat: origin!.lat, lng: origin!.lng, radius, limit: 30, product }),
    '주유소 목록을 불러오지 못했습니다.',
  )

  const items = state.status === 'ready' ? state.data.items : NO_ITEMS
  // 이미 가격순으로 정렬돼 오므로 첫 항목이 최저가다
  const cheapest = items[0]?.price ?? null

  const markers = useMemo<MapMarker[]>(
    () =>
      items.filter(gasHasCoords).map((station) => ({
        id: station.id,
        lat: station.lat,
        lng: station.lng,
        title: station.name,
        subtitle: [
          station.price !== null ? `${station.price.toLocaleString('ko-KR')}원/L` : '',
          formatDistance(station.distanceMeters),
        ]
          .filter(Boolean)
          .join(' · '),
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
      footer="오피넷 신고가 기준이라 현장 표시가와 다를 수 있습니다. 주소·편의시설은 가격순 상위 몇 곳만 채워집니다."
      controls={
        <>
          <div className="flex items-center gap-2">
            <RadiusChips options={RADIUS_OPTIONS} value={radius} onChange={setRadius} />
            <LocateButton position={position} onRefresh={onRefreshPosition} />
          </div>
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex gap-1.5">
              {GAS_PRODUCTS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setProduct(item.code)}
                  className={chipClass(product === item.code)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <PositionNote position={position}>
            {state.status === 'ready'
              ? `${state.data.productName} · 반경 ${radius / 1000}km 안 ${state.data.total}곳 · 싼 순`
              : `반경 ${radius / 1000}km 안 주유소를 가격순으로`}
          </PositionNote>
        </>
      }
    >
      <PanelBody
        status={state.status}
        message={state.status === 'error' ? state.message : undefined}
        count={items.length}
        loadingText="근처 주유소를 찾는 중…"
        errorTitle="주유소 목록을 불러오지 못했습니다."
        emptyTitle="반경 안에 주유소가 없습니다."
        // 오피넷은 인증키가 거부돼도 오류 대신 빈 목록을 준다. 둘을 구분할 방법이 없어 함께 알린다.
        emptyDescription="반경을 넓혀 보세요. 계속 비어 있다면 OPINET_API_KEY 가 거부됐을 수 있습니다."
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
                  disabled={!gasHasCoords(station)}
                  className="block w-full text-left disabled:cursor-default"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-stone-900">{station.name}</h3>
                      <p className="mt-0.5 truncate text-sm text-stone-500">
                        {station.brandName}
                        {` · ${formatDistance(station.distanceMeters)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="text-base font-bold text-stone-900">
                        {station.price?.toLocaleString('ko-KR')}
                        <span className="ml-0.5 text-xs font-normal text-stone-400">원/L</span>
                      </span>
                      {priceGap(station, cheapest) && (
                        <span className="text-xs text-stone-400">{priceGap(station, cheapest)}</span>
                      )}
                    </div>
                  </div>
                  {station.address && (
                    <p className="mt-2 truncate text-xs text-stone-500">{station.address}</p>
                  )}
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {station.isSelf && (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
                      셀프
                    </span>
                  )}
                  {station.hasCarWash && <span className={tagClass}>세차장</span>}
                  {station.hasMaintenance && <span className={tagClass}>경정비</span>}
                  {station.hasStore && <span className={tagClass}>편의점</span>}
                  {station.certified && <span className={tagClass}>품질인증</span>}
                  <a
                    href={kakaoSearchUrl(`${station.address} ${station.name}`.trim())}
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
