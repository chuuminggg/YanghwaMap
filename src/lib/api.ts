import type { Restaurant, RestaurantDraft } from '../types/restaurant'
import type { DistrictCount, NearbyRestroom, Restroom } from '../types/restroom'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 쓰기 요청에 실어 보낼 공유 비밀번호. 로그인 시 auth 스토어가 채워 넣는다. */
let password: string | null = null
export const setApiPassword = (value: string | null) => {
  password = value
}

/** 401을 받으면 저장된 비밀번호가 더 이상 유효하지 않다는 뜻이므로 로그인 화면으로 되돌린다. */
let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler
}

type Options = { method?: string; body?: unknown; auth?: boolean }

async function request<T>(path: string, { method = 'GET', body, auth = false }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && password) headers['x-app-password'] = password

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.')
  }

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    const message =
      (payload as { error?: string } | null)?.error ?? `요청에 실패했습니다. (${response.status})`
    throw new ApiError(response.status, message)
  }

  return payload as T
}

export const listRestaurants = () => request<Restaurant[]>('/api/restaurants')

export const createRestaurant = (draft: RestaurantDraft) =>
  request<Restaurant>('/api/restaurants', { method: 'POST', body: draft, auth: true })

export const updateRestaurant = (id: string, patch: Partial<RestaurantDraft>) =>
  request<Restaurant>(`/api/restaurants/${id}`, { method: 'PATCH', body: patch, auth: true })

export const deleteRestaurant = (id: string) =>
  request<void>(`/api/restaurants/${id}`, { method: 'DELETE', auth: true })

/** 기준 좌표에서 가까운 순으로 공중화장실을 받아 온다. 공공데이터라 인증 없이 읽는다. */
export const listNearbyRestrooms = (params: {
  lat: number
  lng: number
  radius: number
  limit?: number
}) => {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radius: String(params.radius),
  })
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  return request<NearbyRestroom[]>(`/api/restrooms?${query}`)
}

/** 자치구 하나의 전체 목록. 좌표가 아직 없는 항목도 함께 온다. */
export const listRestroomsByDistrict = (district: string) =>
  request<Restroom[]>(`/api/restrooms?district=${encodeURIComponent(district)}`)

/** 자치구 칩에 쓰는 목록 + 건수 */
export const listRestroomDistricts = () => request<DistrictCount[]>('/api/restrooms/districts')

export type GeocodeResult = {
  processed: number
  located: number
  failed: number
  /** 초당 제한에 걸려 건너뛴 수. 실패가 아니라 다음 호출에서 다시 시도된다. */
  throttled: number
  /** 아직 좌표가 없는 나머지 — 0이 될 때까지 반복 호출한다 */
  remaining: number
}

/**
 * 한 자치구의 좌표를 한 배치만 채운다. 서버 실행 시간 제한 때문에 나눠서 부른다.
 * retry 를 주면 앞서 실패로 표시된 행도 다시 시도한다.
 */
export const geocodeRestroomDistrict = (district: string, retry = false) => {
  const query = new URLSearchParams({ district })
  if (retry) query.set('retry', '1')
  return request<GeocodeResult>(`/api/restrooms/geocode?${query}`, { method: 'POST', auth: true })
}

/** 서버가 가진 APP_PASSWORD와 대조한다. 실패 사유는 ApiError 메시지에 담겨 온다. */
export const verifyPassword = (candidate: string) =>
  request<{ ok: true }>('/api/login', { method: 'POST', body: { password: candidate } })
