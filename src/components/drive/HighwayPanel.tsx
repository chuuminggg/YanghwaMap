import { useCallback, useMemo, useState } from 'react'
import type { PositionState } from '../../hooks/useCurrentPosition'
import { useAsyncQuery } from '../../hooks/useAsyncQuery'
import { listHighwayCctv, listHighwayTraffic } from '../../lib/api'
import { formatDistance, type LatLng } from '../../lib/geo'
import { gradeTone, type HighwayCctv, type HighwayCctvResult, type HighwayTraffic } from '../../types/drive'
import { EmptyState } from '../EmptyState'
import { KakaoMap, type MapMarker } from '../KakaoMap'
import { LocateButton, PositionNote, RadiusChips } from './controls'
import { chipClass, modeClass } from './styles'

const CCTV_RADIUS_OPTIONS = [5_000, 10_000, 20_000] as const
const DEFAULT_CCTV_RADIUS = 10_000

type Mode = 'traffic' | 'cctv'

const NO_CCTV: HighwayCctv[] = []

/**
 * 고속도로 실시간 소통과 CCTV.
 *
 * 두 모드는 성격이 아주 다르다. 소통 정보는 콘존 단위라 좌표가 없어 목록으로만 보여 주고,
 * CCTV는 좌표가 있으므로 지도에 찍는다. 그래서 한 패널 안에서 레이아웃까지 갈라진다.
 */
export function HighwayPanel({
  origin,
  position,
  onRefreshPosition,
}: {
  origin: LatLng | null
  position: PositionState
  onRefreshPosition: () => void
}) {
  const [mode, setMode] = useState<Mode>('traffic')
  const [route, setRoute] = useState<string | null>(null)
  const [radius, setRadius] = useState<number>(DEFAULT_CCTV_RADIUS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const traffic = useAsyncQuery<HighwayTraffic>(
    mode === 'traffic' ? `traffic:${route ?? ''}` : null,
    () => listHighwayTraffic({ route, limit: 40 }),
    '소통 정보를 불러오지 못했습니다.',
  )

  // GPS가 미세하게 흔들릴 때마다 재요청하지 않도록 좌표를 잘라 질의 키로 쓴다
  const cctvKey =
    mode === 'cctv' && origin ? `cctv:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)},${radius}` : null
  const cctv = useAsyncQuery<HighwayCctvResult>(
    cctvKey,
    () => listHighwayCctv({ lat: origin!.lat, lng: origin!.lng, radius, limit: 30 }),
    'CCTV 목록을 불러오지 못했습니다.',
  )

  const cameras = cctv.state.status === 'ready' ? cctv.state.data.items : NO_CCTV
  // 데모 키는 반경을 무시하고 표본만 주므로 '반경 안 N대'라고 말하면 거짓이 된다
  const sample = cctv.state.status === 'ready' && cctv.state.data.sample

  const markers = useMemo<MapMarker[]>(
    () =>
      cameras.map((camera) => ({
        id: camera.id,
        lat: camera.lat,
        lng: camera.lng,
        title: camera.name,
        subtitle: formatDistance(camera.distanceMeters),
      })),
    [cameras],
  )

  const handleMarkerClick = useCallback((id: string) => setSelectedId(id), [])

  /** 스트림은 http 서명 주소라 이 페이지에 embed 할 수 없다. 외부 플레이어로 옮길 수 있게 복사만 해 준다. */
  const copyStream = async (camera: HighwayCctv) => {
    try {
      await navigator.clipboard.writeText(camera.streamUrl)
      setCopied(camera.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setSelectedId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
          <button type="button" onClick={() => switchMode('traffic')} className={modeClass(mode === 'traffic')}>
            소통{route && <span className="ml-1 text-brand-500">•</span>}
          </button>
          <button type="button" onClick={() => switchMode('cctv')} className={modeClass(mode === 'cctv')}>
            CCTV
          </button>
        </div>

        {mode === 'traffic' ? (
          <>
            <div className="-mx-4 overflow-x-auto px-4">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setRoute(null)} className={chipClass(route === null)}>
                  전체
                </button>
                {(traffic.state.status === 'ready' ? traffic.state.data.routes : []).map((item) => (
                  <button
                    key={item.routeName}
                    type="button"
                    onClick={() => setRoute(item.routeName)}
                    className={chipClass(route === item.routeName)}
                  >
                    {item.routeName}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-stone-500">
              {traffic.state.status === 'ready'
                ? `막히는 구간부터 · ${traffic.state.data.total}개 구간${
                    traffic.state.data.updatedAt ? ` · ${traffic.state.data.updatedAt} 기준` : ''
                  }`
                : '전국 고속도로 콘존 단위 실시간 소통 정보입니다.'}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <RadiusChips options={CCTV_RADIUS_OPTIONS} value={radius} onChange={setRadius} />
              <LocateButton position={position} onRefresh={onRefreshPosition} />
            </div>
            <PositionNote position={position}>
              {sample
                ? `공개 데모 키라 반경이 적용되지 않습니다 — 전국 표본 ${cameras.length}대`
                : `내 위치 기준 · 반경 ${radius / 1000}km 안 고속도로 CCTV ${cameras.length}대`}
            </PositionNote>
          </>
        )}
      </div>

      {mode === 'cctv' && (
        <KakaoMap
          markers={markers}
          className="min-h-0 flex-[3]"
          origin={origin}
          selectedId={selectedId}
          onMarkerClick={handleMarkerClick}
        />
      )}

      <div
        className={`min-h-0 overflow-y-auto border-t border-stone-200 bg-stone-50 px-4 py-3 ${
          mode === 'cctv' ? 'flex-[2]' : 'flex-1'
        }`}
      >
        {mode === 'traffic' ? (
          traffic.state.status === 'loading' || traffic.state.status === 'idle' ? (
            <p className="py-8 text-center text-sm text-stone-400">소통 정보를 불러오는 중…</p>
          ) : traffic.state.status === 'error' ? (
            <EmptyState title="소통 정보를 불러오지 못했습니다." description={traffic.state.message} />
          ) : traffic.state.data.items.length === 0 ? (
            <EmptyState title="표시할 구간이 없습니다." description="다른 노선을 골라 보세요." />
          ) : (
            <ul className="space-y-2">
              {traffic.state.data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${gradeTone(item.grade)}`}
                  >
                    {item.gradeLabel || '자료없음'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-900">{item.conzoneName}</p>
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      {item.routeName}
                      {item.direction && ` · ${item.direction}`}
                      {item.trafficAmount !== null && ` · ${item.trafficAmount.toLocaleString('ko-KR')}대`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-stone-700">
                    {item.speed === null ? '—' : `${item.speed}km/h`}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : cctv.state.status === 'loading' || cctv.state.status === 'idle' ? (
          <p className="py-8 text-center text-sm text-stone-400">근처 CCTV를 찾는 중…</p>
        ) : cctv.state.status === 'error' ? (
          <EmptyState title="CCTV 목록을 불러오지 못했습니다." description={cctv.state.message} />
        ) : cameras.length === 0 ? (
          <EmptyState
            title="반경 안에 고속도로 CCTV가 없습니다."
            description="고속도로변에만 설치돼 있습니다. 반경을 넓혀 보세요."
          />
        ) : (
          <ul className="space-y-2">
            {cameras.map((camera) => (
              <li
                key={camera.id}
                className={`rounded-xl border bg-white px-4 py-3 transition ${
                  selectedId === camera.id ? 'border-brand-500 ring-1 ring-brand-500' : 'border-stone-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(camera.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">
                    {camera.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-brand-600">
                    {formatDistance(camera.distanceMeters)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void copyStream(camera)}
                  className="mt-2 rounded-full border border-stone-200 px-2.5 py-0.5 text-xs text-stone-500 transition hover:border-brand-300 hover:text-brand-600"
                >
                  {copied === camera.id ? '복사됨' : `${camera.format || 'HLS'} 주소 복사`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
        {mode === 'traffic'
          ? '한국도로공사 실시간 자료입니다. 검지기가 값을 못 주면 자료없음으로 표시됩니다.'
          : sample
            ? 'ITS 공개 데모 키는 좌표 범위를 무시하고 같은 표본만 돌려줍니다. 내 주변으로 쓰려면 ITS_API_KEY 를 발급받아 넣어 주세요.'
            : 'CCTV 주소는 서명된 HLS라 만료되고 http라서 이 화면에서 재생할 수 없습니다. 복사해 외부 플레이어로 여세요.'}
      </p>
    </div>
  )
}
