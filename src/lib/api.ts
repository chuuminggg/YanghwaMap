import type { Restaurant, RestaurantDraft } from '../types/restaurant'

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

/** 서버가 가진 APP_PASSWORD와 대조한다. 실패 사유는 ApiError 메시지에 담겨 온다. */
export const verifyPassword = (candidate: string) =>
  request<{ ok: true }>('/api/login', { method: 'POST', body: { password: candidate } })
