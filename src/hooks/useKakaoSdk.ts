import { useEffect, useState } from 'react'
import { hasKakaoKey, loadKakaoMaps } from '../lib/kakao'

export type KakaoSdkState =
  | { status: 'no-key' }
  | { status: 'loading' }
  | { status: 'ready'; maps: typeof kakao.maps }
  | { status: 'error'; message: string }

/** SDK 로딩 상태를 컴포넌트에서 다루기 쉽게 감싼 훅. 키가 없으면 에러 대신 'no-key'. */
export function useKakaoSdk(): KakaoSdkState {
  const [state, setState] = useState<KakaoSdkState>(() =>
    hasKakaoKey ? { status: 'loading' } : { status: 'no-key' },
  )

  useEffect(() => {
    if (!hasKakaoKey) return
    let alive = true

    loadKakaoMaps().then(
      (maps) => alive && setState({ status: 'ready', maps }),
      (error: unknown) =>
        alive &&
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '카카오맵을 불러오지 못했습니다.',
        }),
    )

    return () => {
      alive = false
    }
  }, [])

  return state
}
