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
}

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 }

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function KakaoMap({ markers, className = '', level = 4, onMarkerClick }: Props) {
  const sdk = useKakaoSdk()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<kakao.maps.Map | null>(null)
  const markerRefs = useRef<kakao.maps.Marker[]>([])
  const infoRef = useRef<kakao.maps.InfoWindow | null>(null)

  // 지도 인스턴스는 SDK가 준비된 뒤 한 번만 만든다
  useEffect(() => {
    if (sdk.status !== 'ready' || !containerRef.current || mapRef.current) return
    const { maps } = sdk
    mapRef.current = new maps.Map(containerRef.current, {
      center: new maps.LatLng(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng),
      level: 8,
    })
  }, [sdk])

  // 마커 목록이 바뀔 때마다 전부 새로 그리고 화면을 맞춘다
  useEffect(() => {
    if (sdk.status !== 'ready' || !mapRef.current) return
    const { maps } = sdk
    const map = mapRef.current

    markerRefs.current.forEach((marker) => marker.setMap(null))
    markerRefs.current = []
    infoRef.current?.close()

    if (markers.length === 0) return

    const bounds = new maps.LatLngBounds()
    for (const item of markers) {
      const position = new maps.LatLng(item.lat, item.lng)
      const marker = new maps.Marker({ position, map, title: item.title })
      bounds.extend(position)
      markerRefs.current.push(marker)

      maps.event.addListener(marker, 'click', () => {
        infoRef.current?.close()
        const subtitle = item.subtitle
          ? `<div style="color:#78716c;font-size:11px;margin-top:2px">${escapeHtml(item.subtitle)}</div>`
          : ''
        infoRef.current = new maps.InfoWindow({
          content: `<div style="padding:8px 10px;font-size:13px;line-height:1.4;max-width:220px">
            <strong>${escapeHtml(item.title)}</strong>${subtitle}
          </div>`,
        })
        infoRef.current.open(map, marker)
        onMarkerClick?.(item.id)
      })
    }

    if (markers.length === 1) {
      map.setCenter(new maps.LatLng(markers[0].lat, markers[0].lng))
      map.setLevel(level)
    } else {
      map.setBounds(bounds, 40, 40, 40, 40)
    }
  }, [sdk, markers, level, onMarkerClick])

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
      {sdk.status === 'ready' && markers.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-stone-500">
          표시할 좌표가 없습니다 — 상세 화면에서 &lsquo;주소 찾기&rsquo;로 위치를 등록해 주세요.
        </div>
      )}
    </div>
  )
}
