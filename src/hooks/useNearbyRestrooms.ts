import { useEffect, useRef, useState } from 'react'
import { listNearbyRestrooms } from '../lib/api'
import type { LatLng } from '../lib/geo'
import type { NearbyRestroom } from '../types/restroom'

export type NearbyState =
  | { status: 'loading' }
  | { status: 'ready'; items: NearbyRestroom[] }
  | { status: 'error'; message: string }

/** GPS가 미세하게 흔들릴 때마다 재요청하지 않도록 좌표를 약 10cm 단위로 끊는다. */
const key = (origin: LatLng | null, radius: number) =>
  origin ? `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)},${radius}` : ''

/**
 * 기준점과 반경이 바뀔 때마다 근처 화장실을 받아 온다.
 *
 * 결과가 질의에 딸린 값이고 이 화면에서만 쓰이므로 전역 스토어(useRestaurantStore) 대신
 * 지역 상태로 둔다. 응답이 늦게 도착해 앞선 결과를 덮어쓰지 않도록 요청 번호로 걸러 낸다.
 */
export function useNearbyRestrooms(origin: LatLng | null, radius: number): NearbyState {
  const [state, setState] = useState<NearbyState>({ status: 'loading' })
  const requestId = useRef(0)
  const cacheKey = key(origin, radius)

  useEffect(() => {
    if (!origin) return

    const id = ++requestId.current
    setState({ status: 'loading' })

    listNearbyRestrooms({ lat: origin.lat, lng: origin.lng, radius, limit: 50 }).then(
      (items) => {
        if (id === requestId.current) setState({ status: 'ready', items })
      },
      (error: unknown) => {
        if (id !== requestId.current) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '화장실 목록을 불러오지 못했습니다.',
        })
      },
    )
    // origin 객체는 매 렌더 새로 만들어지므로 좌표 문자열을 의존성으로 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  return state
}
