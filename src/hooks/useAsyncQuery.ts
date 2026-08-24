import { useCallback, useEffect, useRef, useState } from 'react'

export type QueryState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }

/**
 * 질의 문자열이 바뀔 때마다 한 번씩 부르고, 늦게 도착한 응답은 버리는 훅.
 *
 * useNearbyRestrooms / useDistrictRestrooms 가 각자 갖고 있던 요청 번호 방식을 일반화한 것이다.
 * 운전 탭은 성격이 다른 조회가 다섯 개라 같은 코드를 다섯 번 베끼는 대신 여기로 모았다.
 * (화장실 훅은 이미 동작 중이라 건드리지 않는다 — 옮길 이유가 생기면 그때 옮긴다.)
 *
 * key 가 null 이면 요청하지 않고 'idle' 로 남는다. 탭이 여러 개인 화면에서
 * 보이지 않는 탭의 훅까지 네트워크를 쓰지 않게 하려면 이 형태가 필요하다.
 */
export function useAsyncQuery<T>(
  key: string | null,
  run: () => Promise<T>,
  fallbackMessage: string,
): { state: QueryState<T>; refresh: () => void } {
  const [state, setState] = useState<QueryState<T>>({ status: 'idle' })
  const requestId = useRef(0)

  // run 은 매 렌더 새로 만들어지는 화살표 함수다. 의존성에 넣으면 무한 루프가 되므로
  // 최신 값만 ref 로 들고 있고, 재실행 조건은 key 하나로만 판단한다.
  const runRef = useRef(run)
  runRef.current = run

  const load = useCallback(() => {
    if (key === null) {
      setState({ status: 'idle' })
      return
    }

    const id = ++requestId.current
    setState({ status: 'loading' })

    runRef.current().then(
      (data) => {
        if (id === requestId.current) setState({ status: 'ready', data })
      },
      (error: unknown) => {
        if (id !== requestId.current) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : fallbackMessage,
        })
      },
    )
  }, [key, fallbackMessage])

  useEffect(() => load(), [load])

  return { state, refresh: load }
}
