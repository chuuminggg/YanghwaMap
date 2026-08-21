import { neon } from '@neondatabase/serverless'
import type { Restaurant, RestaurantDraft } from '../../src/types/restaurant.js'

/** Vercel의 Neon 통합은 DATABASE_URL을, 구 Vercel Postgres는 POSTGRES_URL을 주입한다. */
const connectionString = () => process.env.DATABASE_URL || process.env.POSTGRES_URL

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL이 설정되지 않았습니다. Vercel Storage에서 Postgres를 연결해 주세요.')
    this.name = 'MissingDatabaseUrlError'
  }
}

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInputError'
  }
}

let client: ReturnType<typeof neon> | null = null

/** 서버리스 인스턴스가 재사용될 때 클라이언트도 함께 재사용한다 (HTTP 드라이버라 풀 관리는 불필요). */
function db() {
  const url = connectionString()
  if (!url) throw new MissingDatabaseUrlError()
  client ??= neon(url)
  return client
}

type FieldKind = 'text' | 'number' | 'boolean' | 'rating'

/**
 * RestaurantDraft의 모든 필드 ↔ 컬럼 매핑. `satisfies`로 필드 누락을 컴파일 타임에 잡는다.
 * nullable 컬럼만 명시적 null(값 지우기)을 허용한다.
 */
const FIELDS = {
  name: { column: 'name', kind: 'text', nullable: false },
  menu: { column: 'menu', kind: 'text', nullable: false },
  district: { column: 'district', kind: 'text', nullable: false },
  dong: { column: 'dong', kind: 'text', nullable: false },
  areaRaw: { column: 'area_raw', kind: 'text', nullable: false },
  address: { column: 'address', kind: 'text', nullable: false },
  lat: { column: 'lat', kind: 'number', nullable: true },
  lng: { column: 'lng', kind: 'number', nullable: true },
  kakaoPlaceUrl: { column: 'kakao_place_url', kind: 'text', nullable: true },
  memo: { column: 'memo', kind: 'text', nullable: false },
  reference: { column: 'reference', kind: 'text', nullable: false },
  visited: { column: 'visited', kind: 'boolean', nullable: false },
  rating: { column: 'rating', kind: 'rating', nullable: true },
} satisfies Record<keyof RestaurantDraft, { column: string; kind: FieldKind; nullable: boolean }>

type FieldKey = keyof typeof FIELDS
const FIELD_KEYS = Object.keys(FIELDS) as FieldKey[]

/** 검증을 통과한 입력. 존재하는 키만 담기므로 그대로 SQL 컬럼 목록이 된다. */
export type RestaurantInput = Partial<Record<FieldKey, string | number | boolean | null>>

function coerce(key: FieldKey, raw: unknown): string | number | boolean | null | undefined {
  const field = FIELDS[key]
  if (raw === null) return field.nullable ? null : undefined
  switch (field.kind) {
    case 'text':
      return typeof raw === 'string' ? raw.trim() : undefined
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined
    case 'rating':
      return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : undefined
  }
}

/** 본문에 실제로 담겨 온 필드만 골라 검증한다. 알 수 없는 키는 조용히 무시된다. */
export function parsePatch(body: unknown): RestaurantInput {
  if (!body || typeof body !== 'object') throw new InvalidInputError('요청 본문이 올바르지 않습니다.')
  const source = body as Record<string, unknown>
  const input: RestaurantInput = {}

  for (const key of FIELD_KEYS) {
    if (!(key in source)) continue
    const value = coerce(key, source[key])
    if (value === undefined) throw new InvalidInputError(`'${key}' 값이 올바르지 않습니다.`)
    input[key] = value
  }
  return input
}

export function parseDraft(body: unknown): RestaurantInput {
  const input = parsePatch(body)
  if (!input.name) throw new InvalidInputError('상호(name)는 필수입니다.')
  return input
}

type Row = {
  id: string
  name: string
  menu: string
  district: string
  dong: string
  area_raw: string
  address: string
  lat: number | null
  lng: number | null
  kakao_place_url: string | null
  memo: string
  reference: string
  visited: boolean
  rating: number | null
  created_at: Date | string
  updated_at: Date | string
}

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

/** snake_case 행을 프런트가 그대로 쓰는 Restaurant 모양으로 바꾼다 (null → undefined). */
const toRestaurant = (row: Row): Restaurant => ({
  id: row.id,
  name: row.name,
  menu: row.menu,
  district: row.district,
  dong: row.dong,
  areaRaw: row.area_raw,
  address: row.address,
  lat: row.lat ?? undefined,
  lng: row.lng ?? undefined,
  kakaoPlaceUrl: row.kakao_place_url ?? undefined,
  memo: row.memo,
  reference: row.reference,
  visited: row.visited,
  rating: row.rating ?? undefined,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

const columnsOf = (input: RestaurantInput) =>
  (Object.keys(input) as FieldKey[]).map((key) => ({
    column: FIELDS[key].column,
    value: input[key] as string | number | boolean | null,
  }))

/** 새로 추가한 곳이 위로 오도록 등록순 내림차순. 수정해도 목록 위치는 흔들리지 않는다. */
export async function listRestaurants(): Promise<Restaurant[]> {
  const rows = await db().query('select * from restaurants order by created_at desc, id')
  return (rows as Row[]).map(toRestaurant)
}

export async function insertRestaurant(input: RestaurantInput): Promise<Restaurant> {
  const fields = columnsOf(input)
  const rows = await db().query(
    `insert into restaurants (${fields.map((f) => f.column).join(', ')})
     values (${fields.map((_, i) => `$${i + 1}`).join(', ')})
     returning *`,
    fields.map((f) => f.value),
  )
  return toRestaurant((rows as Row[])[0])
}

/** 없는 id면 null. updated_at은 항상 갱신하므로 빈 patch도 유효한 SQL이 된다. */
export async function patchRestaurant(
  id: string,
  input: RestaurantInput,
): Promise<Restaurant | null> {
  const fields = columnsOf(input)
  const assignments = [
    ...fields.map((f, i) => `${f.column} = $${i + 2}`),
    'updated_at = now()',
  ]
  const rows = await db().query(
    `update restaurants set ${assignments.join(', ')} where id = $1 returning *`,
    [id, ...fields.map((f) => f.value)],
  )
  const row = (rows as Row[])[0]
  return row ? toRestaurant(row) : null
}

export async function deleteRestaurant(id: string): Promise<boolean> {
  const rows = await db().query('delete from restaurants where id = $1 returning id', [id])
  return (rows as Row[]).length > 0
}
