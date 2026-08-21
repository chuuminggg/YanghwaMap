import { useCallback, useEffect, useState } from 'react'
import type { LatLng } from '../lib/geo'

/** 위치를 못 잡았을 때 기준으로 삼는 좌표 (합정역). 앱이 다루는 동네 한가운데다. */
export const DEFAULT_ORIGIN: LatLng = { lat: 37.5495, lng: 126.9137 }

export type PositionState =
  | { status: 'locating' }
  | { status: 'ready'; origin: LatLng; accuracy: number; fallback: false }
  | { status: 'fallback'; origin: LatLng; fallback: true; reason: string }

/** 권한 거부는 정상적인 선택이므로 에러가 아니라 폴백으로 다룬다. */
function reasonOf(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return '위치 권한이 없어 기본 위치(합정역) 기준입니다.'
  if (error.code === error.TIMEOUT) return '위치를 잡지 못해 기본 위치(합정역) 기준입니다.'
  return '위치를 확인할 수 없어 기본 위치(합정역) 기준입니다.'
}

/**
 * 현재 위치를 한 번 잡고, refresh()로 다시 잡는다.
 * useKakaoSdk와 같은 판별 유니온이라 호출부가 status로만 분기하면 된다.
 */
export function useCurrentPosition() {
  const [state, setState] = useState<PositionState>({ status: 'locating' })

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({
        status: 'fallback',
        origin: DEFAULT_ORIGIN,
        fallback: true,
        reason: '이 브라우저는 위치 기능을 지원하지 않아 기본 위치(합정역) 기준입니다.',
      })
      return () => {}
    }

    let alive = true
    setState({ status: 'locating' })

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!alive) return
        setState({
          status: 'ready',
          origin: { lat: coords.latitude, lng: coords.longitude },
          accuracy: coords.accuracy,
          fallback: false,
        })
      },
      (error) => {
        if (!alive) return
        setState({ status: 'fallback', origin: DEFAULT_ORIGIN, fallback: true, reason: reasonOf(error) })
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => locate(), [locate])

  return { position: state, refresh: locate }
}
