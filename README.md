# YanghwaMap

내가 가본 맛집을 **구역별로 정리**하고, 급할 때 **근처 공중화장실**을 찾는 모바일 우선 웹앱.

원본은 개인 엑셀 목록이었다. 구/동이 한 칸에 뒤섞여 있고 주소도 좌표도 없어서 지도에 찍을 수 없었다.
이걸 파싱해 PostgreSQL(Neon)에 넣고, 카카오맵 장소 검색으로 주소·좌표를 채워 넣는 앱으로 만들었다.
데이터는 서버에 있으므로 기기·브라우저가 달라도 같은 목록을 본다.

```
브라우저 (React SPA)  ──fetch──▶  /api (Vercel Serverless)  ──▶  PostgreSQL (Neon)
      │                                    │
      └── 카카오맵 SDK (지도·장소검색)         └── 카카오 REST API (주소 → 좌표)
```

---

## 주요 기능

### 맛집

| 기능 | 설명 |
|---|---|
| **구역 필터** | 구(1단계) → 동(2단계) 칩 필터. 건수 기준 정렬이라 자주 가는 구가 앞에 온다 |
| **메뉴/업종 필터** | `백반집`, `기사식당` 같은 업종 칩. `콩나물해장, 소머리국밥`처럼 한 칸에 묶인 값을 쪼개고 `다수`·`외`·`등` 꼬리말을 떼어 같은 칩으로 합친다 |
| **통합 검색** | 상호 / 메뉴 / 구·동 / 메모 / 참조 / 주소를 한 번에 훑는다 |
| **방문 여부** | `가본 곳` / `가볼 곳` 필터, 카드에서 바로 토글 (낙관적 반영 후 실패 시 롤백) |
| **주소 찾기** | 카카오 장소 키워드 검색 한 번으로 주소·좌표·카카오맵 링크를 한꺼번에 채운다 |
| **지도** | 필터 결과를 지도 + 목록으로. 마커와 카드가 선택 상태를 공유한다. 좌표 미등록 건수를 하단에 표시 |
| **내 주변** | 현재 위치에서 가까운 순. 반경 전체/1km/3km/5km. 좌표가 없는 곳은 목록 아래에 따로 모은다 |
| **CRUD** | 등록 / 수정 / 삭제. 별점(1~5), 메모, 참조 |

### 공중화장실

| 기능 | 설명 |
|---|---|
| **지역구 모드** | 자치구 칩으로 골라 이름순 전체 목록. 좌표가 없어도 목록은 동작한다 |
| **내 주변 모드** | 현재 위치 기준 반경 300m / 500m / 1km 안에서 거리순. 위치 권한이 없으면 합정역 기준으로 폴백 |
| **좌표 불러오기** | 고른 자치구의 빈 좌표를 서버가 카카오 주소검색으로 채운다. 배치로 나눠 돌고 진행 상황을 표시 |
| **지도 연동** | 마커 클릭 → 목록 항목으로 스크롤, 목록 선택 → 지도 이동 + 인포윈도우 |
| **상세 정보** | 개방시간, 남/녀 변기 수, 장애인용, 기저귀 교환대, 비상벨, CCTV, 관리기관 |

### 공통

- **비밀번호 잠금** — 첫 화면이 로그인. 검증은 서버(`APP_PASSWORD`)가 하므로 빌드 결과물에 비밀번호가 들어가지 않는다. 읽기는 공개, 쓰기는 인증 필요
- **키 없이도 죽지 않음** — 카카오 앱 키가 없으면 지도 영역에만 안내 문구가 뜨고 목록·필터·검색은 그대로 동작한다

---

## 기술 스택

| 구분 | 사용 | 비고 |
|---|---|---|
| **프런트** | React 18, TypeScript 6, React Router 7 | SPA, `createBrowserRouter` |
| **상태** | Zustand 5 | 서버 캐시 / 인증 / 필터를 스토어로 분리. 인증만 `persist` |
| **스타일** | Tailwind CSS 4 (`@tailwindcss/vite`) | 설정 파일 없이 CSS에서 직접 테마 정의 |
| **빌드** | Vite 8, `tsc -b` 프로젝트 참조 | `app` / `node` / `api` 3개 tsconfig |
| **백엔드** | Vercel Serverless Functions (`@vercel/node`) | `api/` 파일 기반 라우팅 |
| **DB** | PostgreSQL (Neon) + `@neondatabase/serverless` | HTTP 드라이버라 서버리스에서 커넥션 풀이 필요 없다 |
| **지도** | 카카오맵 JavaScript SDK (`services` 라이브러리) | 동적 로딩, `autoload=false` |
| **지오코딩** | 카카오 로컬 REST API | 서버(`/api`)와 로컬 스크립트 양쪽에서 같은 규칙으로 사용 |
| **린트** | oxlint | `react/rules-of-hooks` 중심 |
| **스크립트** | Node 22+ (`node --env-file`) | 엑셀·CSV 파서 모두 **외부 의존성 없이** 직접 구현 |

> 런타임 의존성은 5개(`react`, `react-dom`, `react-router`, `zustand`, `@neondatabase/serverless`)뿐이다.
> XLSX·CSV 파싱, CP949 디코딩, haversine 계산은 모두 표준 라이브러리로 처리한다.

---

## 시작하기

```bash
npm install
cp .env.example .env.local   # 아래 표대로 채우기
npm run db:setup             # restaurants / restrooms 테이블 생성 (멱등)
npm run db:seed              # 맛집 시드 47건
npm run db:seed:restrooms    # 공중화장실 시드 5,593건 (서울)
npm run dev                  # http://localhost:5173 — 프런트 + /api 가 함께 뜬다
```

### 환경 변수

| 이름 | 읽는 곳 | 필수 | 설명 |
|---|---|:---:|---|
| `VITE_KAKAO_MAP_APP_KEY` | 클라이언트 | △ | 카카오맵 **JavaScript** 키. 없으면 지도만 비활성 |
| `DATABASE_URL` | 서버 `/api` | ✅ | Postgres 연결 문자열 (`POSTGRES_URL`도 인식) |
| `APP_PASSWORD` | 서버 `/api` | ✅ | 로그인 및 쓰기 검증용 공유 비밀번호 |
| `KAKAO_REST_API_KEY` | 서버 `/api` + 스크립트 | △ | 카카오 **REST API** 키. 화장실 좌표 채우기에만 사용 |

- `VITE_` 접두사가 붙은 값만 빌드 결과물에 포함된다. `DATABASE_URL`·`APP_PASSWORD`에는 **절대 붙이지 말 것.**
- `VITE_APP_PASSWORD`와 `APP_PASSWORD`는 **다른 변수다.** 서버가 검증하므로 접두사 없는 쪽만 쓰인다.
- 값에 따옴표를 붙이면 따옴표까지 비밀번호가 된다.
- 로컬과 Vercel에 **같은 값**을 넣어야 하고, Vercel은 **다음 배포부터** 반영된다.

### DB 연결 (Neon)

Vercel 프로젝트 → **Storage** → **Create Database** → **Neon Postgres** 연결.
배포 환경에는 `DATABASE_URL`이 자동 주입되고, 로컬 값은 CLI로 받아 온다.

```bash
npx vercel link
npx vercel env pull .env.local   # 주의: .env.local 을 덮어쓴다
```

> `vercel env pull` 후 `APP_PASSWORD`와 `VITE_KAKAO_MAP_APP_KEY`가 남아 있는지 확인할 것
> (Vercel에 등록해 두지 않았다면 사라진다).

### 카카오 앱 키

1. [카카오 개발자센터](https://developers.kakao.com) → 내 애플리케이션 → 앱 생성
2. **앱 키 → JavaScript 키** → `VITE_KAKAO_MAP_APP_KEY`
3. **앱 키 → REST API 키** → `KAKAO_REST_API_KEY` (위와 **다른 값**, 같은 앱에서 함께 발급)
4. **앱 설정 → 플랫폼 → Web**에 도메인 등록 — `http://localhost:5173`, 배포 도메인

> 도메인을 등록하지 않으면 SDK 로딩 자체가 거부된다.

### 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (프런트 + `/api`) |
| `npm run build` | `tsc -b` 타입 체크 후 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint |
| `npm run db:setup` | 테이블·인덱스 생성 (멱등) |
| `npm run db:seed` | 맛집 시드 삽입 (`-- --force`로 재삽입) |
| `npm run db:seed:restrooms` | 화장실 시드 삽입 (`-- --force`로 재삽입) |
| `npm run seed` | 엑셀 → `src/data/seed-restaurants.json` |
| `npm run restrooms:fetch` | 공공데이터 CSV 내려받아 → `src/data/seed-restrooms.json` |
| `npm run restrooms:geocode` | 화장실 주소 → 좌표 채우기 (`KAKAO_REST_API_KEY` 필요) |
| `npm run restaurants:geocode` | 맛집 메모의 랜드마크 → 좌표 추정 (`-- --dry`로 조회만) |

---

## 폴더 구조

```
api/                          Vercel Serverless Functions (파일 기반 라우팅)
  _lib/db.ts                  Neon 클라이언트, 필드 검증(FIELDS), row ↔ Restaurant 변환
  _lib/auth.ts                비밀번호 검증(timingSafeEqual) + 공통 오류 응답
  _lib/restrooms.ts           자치구별 목록, 근처 조회(bbox + haversine), 쿼리 파싱
  _lib/geocode.ts             카카오 주소검색 배치 지오코딩 (서버 측)
  login.ts                    POST   /api/login
  restaurants/index.ts        GET·POST      /api/restaurants
  restaurants/[id].ts         PATCH·DELETE  /api/restaurants/:id
  restrooms/index.ts          GET    /api/restrooms
  restrooms/districts.ts      GET    /api/restrooms/districts
  restrooms/geocode.ts        POST   /api/restrooms/geocode

src/
  App.tsx                     라우터 정의 (RequireAuth → Layout → 페이지)
  components/
    Layout.tsx                헤더·탭·목록 선로딩, 잠금 버튼
    RequireAuth.tsx           미인증 시 /login 리다이렉트
    FilterBar.tsx             지역/메뉴 탭 칩 + 검색 + 방문 필터
    KakaoMap.tsx              지도 인스턴스·마커·인포윈도우 수명 관리
    PlaceSearchModal.tsx      장소 키워드 검색 → 주소·좌표 선택
    RestaurantForm.tsx        등록/수정 공용 폼
    RestaurantCard.tsx  RestroomCard.tsx  EmptyState.tsx
  pages/
    ListPage(/)  MapPage(/map)  RestroomPage(/restroom)
    NewPage(/new)  DetailPage(/:id)  EditPage(/:id/edit)  LoginPage(/login)
  store/
    useRestaurantStore.ts     서버 응답 캐시 (persist 없음, 중복 요청 dedupe)
    useAuthStore.ts           비밀번호 persist + 401 시 자동 로그아웃
    useFilterStore.ts         필터 상태 (세션 한정)
    selectors.ts              구/동/메뉴 집계, 필터링 로직
  hooks/
    useKakaoSdk.ts            SDK 로딩 상태 (no-key / loading / ready / error)
    useCurrentPosition.ts     현재 위치 + 폴백(합정역)
    useNearbyRestrooms.ts     거리순 조회 (요청 번호로 늦은 응답 폐기)
    useDistrictRestrooms.ts   자치구 목록 + 자치구 집계
  lib/
    api.ts                    /api 호출 래퍼 (비밀번호 헤더, ApiError 변환)
    kakao.ts                  SDK 동적 로딩 + 장소 검색 래퍼
    geo.ts                    haversine 거리 · 거리 표기
  types/                      restaurant.ts, restroom.ts, kakao.d.ts
  data/                       seed-restaurants.json(47), seed-restrooms.json(5,593)

scripts/
  db-setup.mjs                테이블·인덱스 생성
  db-seed.mjs                 맛집 시드
  db-seed-restrooms.mjs       화장실 시드 (배치 INSERT)
  xlsx-to-seed.mjs            엑셀 파서 (외부 의존성 없음)
  restroom-csv-to-seed.mjs    공공데이터 CSV 파서 (CP949 직접 디코딩)
  restroom-geocode.mjs        주소 → 좌표 (로컬 일괄)
  vite-api-plugin.ts          개발 서버에서 /api 핸들러 실행 (apply: 'serve')
```

---

## 주요 엔드포인트 및 API

인증이 필요한 요청은 `x-app-password` 헤더를 보낸다.
오류는 항상 `{ "error": "..." }` 형태이고 **그대로 화면에 표시되므로 사용자가 읽을 문장으로 쓴다.**

| 메서드 | 경로 | 인증 | 설명 |
|---|---|:---:|---|
| `POST` | `/api/login` | — | `{ password }` 검증. `200` / `401` / `503` |
| `GET` | `/api/restaurants` | 공개 | 전체 목록 (`created_at` 내림차순) |
| `POST` | `/api/restaurants` | 필요 | 등록. `201` + 생성된 항목 |
| `PATCH` | `/api/restaurants/:id` | 필요 | 부분 수정. `200` + 수정된 항목 |
| `DELETE` | `/api/restaurants/:id` | 필요 | 삭제. `204` |
| `GET` | `/api/restrooms?district=` | 공개 | 자치구 전체 목록 (이름순, 좌표 없는 항목 포함) |
| `GET` | `/api/restrooms?lat=&lng=` | 공개 | 거리순. `radius`(100~5000, 기본 1000), `limit`(1~100, 기본 30) |
| `GET` | `/api/restrooms/districts` | 공개 | 자치구별 `total` / `located` 집계 |
| `POST` | `/api/restrooms/geocode?district=` | 필요 | 좌표 채우기 한 배치. `retry=1`이면 실패분 재시도 |

### 요청/응답 예시

```bash
# 로그인
curl -X POST /api/login -H 'Content-Type: application/json' -d '{"password":"..."}'
# -> 200 { "ok": true }

# 등록
curl -X POST /api/restaurants \
  -H 'Content-Type: application/json' -H 'x-app-password: ...' \
  -d '{"name":"한촌설렁탕","menu":"백반집","district":"마포구","dong":"합정동"}'
# -> 201 { "id":"...", "name":"한촌설렁탕", ..., "createdAt":"..." }

# 근처 화장실
curl '/api/restrooms?lat=37.5495&lng=126.9137&radius=500&limit=20'
# -> 200 [{ "id":"...", "name":"...", "distanceMeters":132, ... }]

# 좌표 채우기 (한 배치)
curl -X POST '/api/restrooms/geocode?district=마포구' -H 'x-app-password: ...'
# -> 200 { "processed":60, "located":57, "failed":3, "remaining":121 }
```

### 설계 규칙

- **`:id`는 uuid** — 형식이 아니면 DB를 조회하지 않고 바로 `404`. 옛 `seed-01` 형태 북마크가 500이 되지 않게 한다.
- **본문은 필드별 화이트리스트 검증** (`api/_lib/db.ts`의 `FIELDS`). 모르는 키는 조용히 무시되므로 `id`나 `createdAt`을 실어 보내도 덮어쓰이지 않는다. `satisfies Record<keyof RestaurantDraft, …>`라 필드를 빠뜨리면 빌드가 잡는다.
- **`radius`/`limit`은 거절하지 않고 자른다** — 지도 UI가 오류로 멈추는 것보다 낫다. 반대로 `lat`/`lng`은 없거나 범위를 벗어나면 `400`.
- **읽기는 공개, 쓰기만 인증** — 화장실은 공공데이터이고 맛집 목록도 민감하지 않다.
- **캐시 헤더** — `/api/restrooms`는 `s-maxage=3600`, `/api/restrooms/districts`는 `s-maxage=86400`. 원본이 하루 단위로만 갱신된다.
- **`api/` 안의 상대 import 에는 반드시 `.js` 확장자** — 아래 트러블슈팅 1번 참고.

---

## 데이터

### 저장 구조

`restaurants`, `restrooms` 두 테이블. 컬럼은 snake_case이고 `_lib`가 앱 타입(camelCase)으로 변환하며 `null`은 `undefined`로 바꾼다. 스키마는 `scripts/db-setup.mjs`에 있다.

| 인덱스 | 용도 |
|---|---|
| `restaurants (district, dong)` | 구역 필터 |
| `restrooms (lat, lng)` | 근처 조회의 bbox 스캔 |
| `restrooms (district, name)` | 자치구별 목록 |
| `restrooms (code) where code <> ''` | 관리번호 중복 방지 (빈 값이 있어 부분 인덱스) |

목록은 `created_at` 내림차순이라 새로 추가한 곳이 위에 온다. 시드는 엑셀 순서를 유지하도록 과거 시각으로 넣으므로 이후 추가되는 맛집은 항상 시드보다 위에 표시된다.

브라우저 localStorage에는 로그인 비밀번호(`yanghwa-map-auth`)만 남는다. 목록은 서버가 원본이라 캐시하지 않는다.

### 엑셀 → 앱 필드 매핑

| 엑셀 열 | 앱 필드 | 비고 |
|---|---|---|
| 구역별(동) | `district` / `dong` / `areaRaw` | 서울 25개 구 이름으로 구를 추출, 원문도 보존 |
| 위치 | `memo` | 랜드마크 기반 간단 위치 요약 |
| 상호 및 메뉴 | `name` / `menu` | `한촌설렁탕외 백반집` → 상호 + 메뉴로 분리 |
| 참 조 | `reference` | 영업시간·주차 등 |
| (없음) | `address` / `lat` / `lng` / `kakaoPlaceUrl` | 앱의 **주소 찾기**로 채운다 |

#### 맛집 좌표 — 랜드마크 추정

엑셀에 주소가 없어 47곳 중 44곳이 좌표 없이 시작한다. 다만 `위치` 열이 `뱅뱅사거리`,
`성내도서관옆` 같은 **랜드마크**라, 그 지점을 카카오에서 찾으면 맛집이 바로 옆이므로 쓸 만하다.

```bash
npm run restaurants:geocode -- --dry   # 조회만 하고 결과 확인
npm run restaurants:geocode            # DB에 반영
```

- 메모 끝의 방향어(`옆`·`앞`·`건너편`…)를 떼고 `구 동 + 랜드마크`로 검색한다
- **이미 좌표가 있는 행은 덮어쓰지 않는다** — 사용자가 주소 찾기로 고른 값이 우선
- 추정 좌표는 `coord_source='landmark'`로 남기고 카드에 `위치 대략` 뱃지를 띄운다.
  상세의 주소 찾기로 위치를 고르면 서버가 이 표시를 지운다(정확한 좌표로 승격)
- 실측 **34/44 확보**. 나머지 10건은 `문전초교사거리`, `영림중학교끝 건너편`처럼 POI가 없는
  표현이라 `지도 위치 미등록`으로 남는다

`내 주변`은 좌표가 있는 곳만 거리순으로 정렬하고 나머지는 목록 아래에 따로 모은다 —
거리를 모르는 항목을 0으로 두면 가장 가까운 것처럼 보여 사용자를 잘못 이끈다.
구 중심 좌표로 채우지 않는 것도 같은 이유다(같은 구 맛집이 한 점에 겹치고 오차가 1~3km).

구를 특정할 수 없던 3건(`천호사거리`, `양재동`, `경기도`)은 추정하지 않고 원문을 그대로 뒀다.
원본 엑셀은 개인 데이터라 저장소에 없다 — 변환 결과 JSON만 커밋되므로 `npm run seed`는 로컬에 엑셀이 있을 때만 필요하다.

### 공중화장실 파이프라인

```bash
npm run restrooms:fetch       # 전국 CSV(16MB) → 서울만 추려 seed JSON (5,593건)
npm run db:setup
npm run db:seed:restrooms     # 여기까지만 해도 자치구별 목록은 동작한다
npm run restrooms:geocode     # 주소 → 좌표 (거리순·지도에 필요)
npm run db:seed:restrooms -- --force
```

원본: 공공데이터포털 [전국공중화장실표준데이터](https://www.data.go.kr/data/15012892/standard.do).
다른 지역은 `node scripts/restroom-csv-to-seed.mjs --region 부산광역시` (또는 `--all`).

좌표를 채우는 길은 두 가지이고, 규칙(도로명 → 지번 → `구 + 화장실명` 키워드 순, 주소 정리, 좌표 범위 검사)은 같다.

| | 어디서 | 쓸 때 |
|---|---|---|
| `npm run restrooms:geocode` | 로컬 스크립트 → seed JSON | 전량 일괄. 결과를 커밋해 재사용 |
| 화장실 탭 **좌표 불러오기** | 서버 API → DB 직접 | 고른 자치구만. 새 데이터가 들어왔을 때 |

> 원본은 하루 단위로만 갱신되고 **실시간 개방·점검 상태는 보장하지 않는다.** 화면 하단에도 같은 문구를 띄운다.

---

## 배포 (Vercel)

GitHub 저장소를 연결하면 자동 감지된다. 확인할 것:

- **Storage → Neon Postgres**를 프로젝트에 연결 (`DATABASE_URL` 자동 주입)
- 환경 변수 `VITE_KAKAO_MAP_APP_KEY`, `APP_PASSWORD`, (필요 시) `KAKAO_REST_API_KEY` 등록
- 배포 도메인을 카카오 개발자센터 Web 플랫폼에 추가

`api/` 아래 파일이 서버리스 함수가 된다(`_`로 시작하면 라우트가 되지 않는다).
`vercel.json`의 SPA rewrite는 `/((?!api/).*)` 로 `/api/`를 제외해 API 요청이 `index.html`로 새지 않는다.

---

## 트러블슈팅

### 1. 배포본만 500 — `ERR_MODULE_NOT_FOUND`

로컬은 멀쩡한데 배포하면 API가 전부 죽었다.

Vercel은 `api/*.ts`를 **번들하지 않고 파일별로 트랜스파일해 Node ESM으로 실행한다.** ESM은 상대 import에 확장자를 요구하므로 `from './_lib/db'`가 런타임에 해석되지 않는다.

```ts
import { db } from './_lib/db.js'   // .ts 파일이지만 .js 로 쓴다
```

같은 실수를 다시 하지 않도록 `tsconfig.api.json`을 런타임과 같은 해석 규칙(`module: nodenext`)으로 맞췄다. 이제 확장자를 빠뜨리면 `npm run build`가 **TS2835**로 잡는다.

### 2. `vite dev`가 `/api`를 서비스하지 않는다

`vercel dev`를 따로 띄우는 대신 `scripts/vite-api-plugin.ts`가 Vercel의 파일 기반 라우팅을 흉내낸다.

- `/api/restaurants` → `api/restaurants/index.ts`, `/api/restaurants/{uuid}` → `api/restaurants/[id].ts`
- Vercel이 채워 주는 `req.body`·`req.query`를 직접 만들어 주입
- `res.status().json()` 편의 메서드를 Node 응답 객체에 shim
- `apply: 'serve'`라 빌드에는 포함되지 않는다

덕분에 `npm run dev` 하나로 프런트와 API가 함께 뜬다.

### 3. 서버 전용 환경 변수가 개발 서버 API에 안 들어온다

Vite는 기본적으로 `VITE_` 접두사만 읽고, 그마저도 클라이언트용이다. `vite.config.ts`에서 `loadEnv(mode, cwd, '')`로 접두사 없는 값까지 읽어 `process.env`로 옮긴다.

```ts
if (!process.env[key] && env[key]) process.env[key] = env[key]
```

`if` 없이 그냥 대입하면 값이 없을 때 `process.env`가 문자열 `"undefined"`를 만들어 버려서 "설정은 됐는데 접속이 안 되는" 상태가 된다. 셸에서 직접 준 값이 `.env.local`보다 우선하도록 순서도 이 방향이어야 한다.

### 4. 화장실 표준데이터에 좌표가 없다

전국공중화장실표준데이터는 **2025년 2월부로 WGS84 위도/경도 제공이 중단**되어 CSV에 좌표 컬럼이 아예 없다.

- `lat`/`lng`을 nullable로 두고 **좌표 없이도 자치구별 목록은 그대로 동작하게** 했다. 좌표가 필요한 건 거리순 정렬과 지도 마커뿐이다.
- 좌표는 주소로 채운다. 도로명 → 지번 → `구 + 화장실명` 키워드 순으로 시도하고, 결과가 한국 범위(위도 33~39, 경도 124~132) 밖이면 버린다.
- 주소를 그대로 넣으면 매칭률이 떨어진다. `서울특별시 마포구 방울내로 19, 공중화장실 (망원동)` → 쉼표 뒤 상세주소와 괄호 안 법정동을 떼어 `서울특별시 마포구 방울내로 19`로 정리한다.

### 5. 브라우저에서 카카오 REST API를 직접 못 부른다

CORS로 막히고, 부를 수 있더라도 REST 키가 클라이언트에 노출된다. 그래서 `POST /api/restrooms/geocode`를 두고 서버가 대신 호출한다.

여기서 **서버리스 실행 시간 제한**(Hobby 기본 10초)이 걸린다. 한 구에 최대 600건이라 한 번에 끝나지 않는다.

- 서버는 한 번에 **60건**만 처리하고 `remaining`을 돌려준다 (내부 동시성 6)
- 클라이언트는 `remaining`이 0이 될 때까지 이어서 부르며 진행 상황(`done` / `failed`)을 표시한다
- 카카오가 429를 주면 300ms씩 늘려 가며 3회까지 물러섰다 재시도한다

### 6. 실패한 행 때문에 배치가 무한히 돈다

좌표를 못 찾은 행은 여전히 `lat is null`이라 **다음 배치가 같은 행을 또 붙잡는다.** `remaining`이 줄지 않아 루프가 끝나지 않는다.

`geocode_failed_at` 컬럼에 실패를 표시하고 다음 배치는 그 행을 건너뛴다. 화면에서도 두 상태를 구분한다.

- `아직 안 해봄` → 버튼이 **좌표 불러오기 (N)**
- `해봤지만 실패` → 버튼이 **실패 N곳 다시 시도** (`?retry=1` — 표시를 지우고 재시도)

주소 정리 규칙을 고쳤거나 카카오 색인이 갱신됐을 때 재시도가 의미를 갖는다.

### 7. 자치구를 주소 문자열만으로 못 뽑는다

`\S*?[구군]` 같은 비탐욕 정규식은 `압구정로`를 `압구`로 잘라 낸다. `용산구녹사평대로11길`처럼 붙여 쓴 주소도 있고, `중구`는 `중랑구`의 부분문자열이다.

1. 서울 25개 구 이름을 **긴 것부터** 주소·관리기관명에서 부분문자열로 찾는다 → 5,385건
2. 남은 행은 `개방자치단체코드`가 같은 행들의 **최빈 구**로 채운다 → 208건
3. 코드→구 매핑은 하드코딩하지 않고 1단계에서 풀린 행들로 만든다. 한 코드가 여러 구에 걸치면(순도 95% 미만) **추측하지 않는다**

결과: 25개 구 5,593건 전부 분류.

### 8. CSV가 CP949이고, User-Agent 없으면 403

배포 서버가 UA 없는 요청을 막는다. 그리고 파일은 CP949인데 언젠가 UTF-8로 바뀔 수 있다.

BOM → CP949 → UTF-8 순으로 디코딩해 보고 **헤더에 `화장실명`이 보이는 쪽**을 고른다. 둘 다 실패하면 조용히 깨진 데이터를 넣지 않고 에러로 멈춘다.

### 9. 근처 조회를 SQL 한 방에 (인덱스를 타면서)

`order by haversine(...)`만 쓰면 전체 스캔이다. bbox로 인덱스를 먼저 태워 후보를 줄인 뒤 haversine으로 정렬한다.

- 위도 1도 ≈ 111.32km. 경도는 `cos(위도)`로 나눠 보정하되 극지방에서 0으로 나누지 않도록 하한 `0.01`을 둔다
- bbox는 원보다 넓으므로(모서리가 반경 밖) 정렬 후 반경으로 한 번 더 자른다

거리 계산은 클라이언트(`lib/geo.ts`)에도 같은 식으로 있다. 위치가 갱신됐을 때 재요청 없이 다시 정렬하기 위해서다. **카카오 응답의 `distance` 값은 쓰지 않는다** — 기준이 다르면 정렬이 흔들린다.

### 10. 늦게 도착한 응답이 최신 결과를 덮어쓴다

반경을 500m → 300m로 빠르게 바꾸면 앞선 요청이 나중에 도착해 화면이 되돌아간다. `useNearbyRestrooms` / `useDistrictRestrooms`는 요청 번호(`useRef`)를 매겨 **최신 번호가 아닌 응답을 버린다.**

GPS 미세 흔들림으로 매번 재요청하는 것도 막아야 한다. 의존성으로 `origin` 객체 대신 `lat.toFixed(6),lng.toFixed(6),radius` 문자열을 쓴다(약 10cm 단위).

### 11. 화면 여러 개가 동시에 목록을 부른다

`useRestaurantStore.load()`가 StrictMode 이중 마운트와 다중 화면에서 겹쳐 호출된다. 모듈 스코프 `inflight` Promise를 공유해 **요청은 한 번만** 나가게 했다.

방문 토글은 반대로 즉각 반영이 우선이라 낙관적으로 먼저 바꾸고, 실패하면 **해당 항목만** 이전 값으로 되돌린 뒤 오류를 다시 던진다.

### 12. 카카오맵 SDK 로딩

`autoload=false`로 붙이고 `kakao.maps.load()` 콜백 이후에야 API를 쓸 수 있다. 스크립트가 두 번 주입되지 않도록 로더 Promise를 캐시하되, **네트워크·도메인 오류 시에는 캐시를 해제**해 재시도가 가능하게 한다.

키가 없으면 예외를 던지는 대신 `useKakaoSdk`가 `'no-key'` 상태를 돌려준다. 지도 영역만 안내 문구로 바뀌고 나머지 기능은 살아 있다.

### 13. 비밀번호 비교

`===`는 조기 종료되어 타이밍 정보를 흘리고, `timingSafeEqual`은 길이가 다르면 예외를 던진다(= 길이가 새어 나간다). 양쪽 모두 **sha256 다이제스트로 고정 길이를 만든 뒤** `timingSafeEqual`로 비교한다.

서버가 401을 주면(비밀번호 변경 등) `lib/api.ts`가 등록된 핸들러로 auth 스토어를 비워 로그인 화면으로 되돌린다. 새로고침 직후에도 쓰기가 통과하도록 persist `merge` 단계에서 `setApiPassword`를 다시 호출한다.

> 여러 사람이 하나의 비밀번호를 나눠 쓰는, "링크를 아는 사람을 걸러내는" 수준의 잠금이다.
> 계정별 권한이 필요해지면 세션 토큰 기반 인증으로 바꿔야 한다.

### 자주 겪는 증상

| 증상 | 원인 |
|---|---|
| "서버에 APP_PASSWORD가 설정되지 않았습니다" | `APP_PASSWORD` 미설정. `VITE_APP_PASSWORD`는 다른 변수다 |
| 비밀번호가 맞는데 401 | 로컬과 Vercel 값이 다르거나, 값에 따옴표가 붙었다 |
| 환경 변수를 바꿨는데 그대로다 | 개발 서버 재시작 필요. Vercel은 재배포해야 반영된다 |
| 목록 화면이 "다시 시도"만 보인다 | `DATABASE_URL` 미설정이거나 `db:setup`을 아직 안 돌렸다 |
| 배포본만 500 (`ERR_MODULE_NOT_FOUND`) | `api/`의 상대 import에 `.js` 확장자가 빠졌다 |
| 지도가 안 뜨고 안내 문구만 나온다 | `VITE_KAKAO_MAP_APP_KEY` 미설정 또는 도메인 미등록 |
| 화장실 목록은 나오는데 지도에 아무것도 없다 | 좌표 미등록. **좌표 불러오기**를 누르거나 `restrooms:geocode` 실행 |
| 좌표 불러오기가 503 | `KAKAO_REST_API_KEY` 미설정 (JavaScript 키와 다른 값) |
| 좌표 불러오기가 401/403 | REST 키가 틀렸거나 카카오 개발자센터에서 카카오맵/로컬 API가 꺼져 있다 |
