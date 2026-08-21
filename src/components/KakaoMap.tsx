import { useEffect, useRef } from 'react'
import { useKakaoSdk } from '../hooks/useKakaoSdk'

export type MapMarker = {
  id: string
  lat: number
  lng: number
  title: string
  subtitle?: string
}

type Props = {
  markers: MapMarker[]
  className?: string
  /** 마커가 하나일 때의 확대 수준 (숫자가 작을수록 확대) */
  level?: number
  onMarkerClick?: (id: string) => void
  /** '내 위치' 점. 주면 파란 점으로 그리고 화면 맞춤에도 포함한다. */
  origin?: { lat: number; lng: number } | null
  /** 값이 바뀌면 해당 마커로 이동하고 인포윈도우를 연다 */
  selectedId?: string | null
}

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 }

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** 내 위치 표시용 파란 점. 외부 요청 없이 쓰려고 data: URI로 인라인한다. */
const ORIGIN_DOT_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
     <circle cx="11" cy="11" r="10" fill="#3b82f6" fill-opacity="0.25"/>
     <circle cx="11" cy="11" r="5" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
   </svg>`,
)}`

export function KakaoMap({
  markers,
  className = '',
  level = 4,
  onMarkerClick,
  origin = null,
  selectedId = null,
}: Props) {
  const sdk = useKakaoSdk()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<kakao.maps.Map | null>(null)
  // 목록 선택으로 특정 마커를 열어야 해서 배열 대신 id로 찾을 수 있게 둔다
  const markerRefs = useRef(new Map<string, { marker: kakao.maps.Marker; item: MapMarker }>())
  const originRef = useRef<kakao.maps.Marker | null>(null)
  const infoRef = useRef<kakao.maps.InfoWindow | null>(null)
  const openInfoRef = useRef<(id: string) => void>(() => {})

  // 지도 인스턴스는 SDK가 준비된 뒤 한 번만 만든다
  useEffect(() => {
    if (sdk.status !== 'ready' || !containerRef.current || mapRef.current) return
    const { maps } = sdk
    mapRef.current = new maps.Map(containerRef.current, {
      center: new maps.LatLng(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng),
      level: 8,
    })
  }, [sdk])

  // 내 위치 점은 마커 목록과 수명이 달라 따로 관리한다
  useEffect(() => {
    if (sdk.status !== 'ready' || !mapRef.current) return
    const { maps } = sdk

    originRef.current?.setMap(null)
    originRef.current = null
    if (!origin) return

    originRef.current = new maps.Marker({
      position: new maps.LatLng(origin.lat, origin.lng),
      map: mapRef.current,
      title: '내 위치',
      image: new maps.MarkerImage(ORIGIN_DOT_SVG, new maps.Size(22, 22), {
        offset: new maps.Point(11, 11),
      }),
      zIndex: 10,
    })
  }, [sdk, origin])

  // 마커 목록이 바뀔 때마다 전부 새로 그리고 화면을 맞춘다
  useEffect(() => {
    if (sdk.status !== 'ready' || !mapRef.current) return
    const { maps } = sdk
    const map = mapRef.current

    markerRefs.current.forEach(({ marker }) => marker.setMap(null))
    markerRefs.current.clear()
    infoRef.current?.close()

    // 클릭과 selectedId 효과가 같은 인포윈도우 로직을 공유한다
    openInfoRef.current = (id: string) => {
      const entry = markerRefs.current.get(id)
      if (!entry) return
      infoRef.current?.close()
      const subtitle = entry.item.subtitle
        ? `<div style="color:#78716c;font-size:11px;margin-top:2px">${escapeHtml(entry.item.subtitle)}</div>`
        : ''
      infoRef.current = new maps.InfoWindow({
        content: `<div style="padding:8px 10px;font-size:13px;line-height:1.4;max-width:220px">
            <strong>${escapeHtml(entry.item.title)}</strong>${subtitle}
          </div>`,
      })
      infoRef.current.open(map, entry.marker)
    }

    if (markers.length === 0) {
      // 마커가 없어도 내 위치는 보여 준다
      if (origin) map.setCenter(new maps.LatLng(origin.lat, origin.lng))
      return
    }

    const bounds = new maps.LatLngBounds()
    if (origin) bounds.extend(new maps.LatLng(origin.lat, origin.lng))

    for (const item of markers) {
      const position = new maps.LatLng(item.lat, item.lng)
      const marker = new maps.Marker({ position, map, title: item.title })
      bounds.extend(position)
      markerRefs.current.set(item.id, { marker, item })

      maps.event.addListener(marker, 'click', () => {
        openInfoRef.current(item.id)
        onMarkerClick?.(item.id)
      })
    }

    if (markers.length === 1 && !origin) {
      map.setCenter(new maps.LatLng(markers[0].lat, markers[0].lng))
      map.setLevel(level)
    } else {
      map.setBounds(bounds, 40, 40, 40, 40)
    }
  }, [sdk, markers, level, onMarkerClick, origin])

  // 목록에서 고른 항목을 지도에서 열어 준다 (마커를 다시 그린 뒤에 실행되도록 markers도 의존성에 둔다)
  useEffect(() => {
    if (sdk.status !== 'ready' || !mapRef.current || !selectedId) return
    const entry = markerRefs.current.get(selectedId)
    if (!entry) return
    mapRef.current.panTo(entry.marker.getPosition())
    openInfoRef.current(selectedId)
  }, [sdk, selectedId, markers])

  if (sdk.status === 'no-key') {
    return (
      <div className={`grid place-items-center bg-stone-100 p-6 text-center ${className}`}>
        <p className="text-sm text-stone-500">
          카카오맵 앱 키가 없습니다.
          <br />
          <code className="text-xs">.env.local</code> 에 <code className="text-xs">VITE_KAKAO_MAP_APP_KEY</code> 를
          설정하면 지도가 표시됩니다.
        </p>
      </div>
    )
  }

  if (sdk.status === 'error') {
    return (
      <div className={`grid place-items-center bg-red-50 p-6 text-center ${className}`}>
        <p className="text-sm text-red-600">{sdk.message}</p>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {sdk.status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-stone-100 text-sm text-stone-400">
          지도를 불러오는 중…
        </div>
      )}
      {sdk.status === 'ready' && markers.length === 0 && !origin && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-stone-500">
          표시할 좌표가 없습니다 — 상세 화면에서 &lsquo;주소 찾기&rsquo;로 위치를 등록해 주세요.
        </div>
      )}
    </div>
  )
}
