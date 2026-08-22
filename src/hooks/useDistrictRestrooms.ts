import { useCallback, useEffect, useRef, useState } from 'react'
import { listRestroomDistricts, listRestroomsByDistrict } from '../lib/api'
import type { DistrictCount, Restroom } from '../types/restroom'

export type DistrictListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: Restroom[] }
  | { status: 'error'; message: string }

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

/** 자치구 칩 목록. 시드를 다시 넣기 전까지 바뀌지 않으므로 한 번만 부른다. */
export function useRestroomDistricts() {
  const [districts, setDistricts] = useState<DistrictCount[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listRestroomDistricts().then(
      (items) => alive && setDistricts(items),
      (cause: unknown) => alive && setError(message(cause, '자치구 목록을 불러오지 못했습니다.')),
    )
    return () => {
      alive = false
    }
  }, [])

  return { districts, error }
}

/** 고른 자치구의 화장실 전체. useNearbyRestrooms와 같은 요청 번호 방식으로 늦은 응답을 버린다. */
export function useDistrictRestrooms(district: string | null) {
  const [state, setState] = useState<DistrictListState>({ status: 'idle' })
  const requestId = useRef(0)

  const load = useCallback(
    (options: { quiet?: boolean } = {}) => {
      if (!district) {
        setState({ status: 'idle' })
        return
      }

      const id = ++requestId.current
      // 좌표를 채운 뒤 다시 부를 때는 목록을 로딩 화면으로 되돌리지 않는다
      if (!options.quiet) setState({ status: 'loading' })

      listRestroomsByDistrict(district).then(
        (items) => {
          if (id === requestId.current) setState({ status: 'ready', items })
        },
        (error: unknown) => {
          if (id !== requestId.current) return
          setState({ status: 'error', message: message(error, '목록을 불러오지 못했습니다.') })
        },
      )
    },
    [district],
  )

  useEffect(() => load(), [load])

  return { state, refresh: () => load({ quiet: true }) }
}
