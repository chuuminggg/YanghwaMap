# YanghwaMap

내가 가본 맛집을 **구역별로 정리**하고 **카카오맵**에서 위치를 확인하는 웹앱.
데이터는 **PostgreSQL(Neon)** 에 저장하고 **Vercel Serverless Functions**(`/api`)로 읽고 쓴다.
기기·브라우저가 달라도 같은 목록을 본다.

## 기능

- **구역 필터** — 구(1단계) → 동(2단계) 칩 필터, 건수 표시
- **검색** — 상호 / 메뉴 / 메모 / 참조 / 주소 통합 검색
- **카카오맵 연동** — 장소 키워드 검색 한 번으로 주소·좌표·카카오맵 링크를 자동 입력
- **지도 화면** — 필터 결과를 마커로 표시, 마커 클릭 시 상세로 이동
- **항목별 정보** — 상호, 메뉴, 구/동, 주소, 추가 메모(간단 위치 요약), 참조, 방문 여부

## 시작하기

```bash
npm install
cp .env.example .env.local   # 아래 환경 변수 채우기
npm run db:setup             # restaurants 테이블 생성 (한 번만)
npm run db:seed              # 엑셀 시드 47건 삽입
npm run dev                  # http://localhost:5173 (프런트 + /api 함께 뜬다)
```

### 환경 변수

| 이름 | 어디서 읽나 | 설명 |
|---|---|---|
| `VITE_KAKAO_MAP_APP_KEY` | 클라이언트 | 카카오맵 JavaScript 키 |
| `DATABASE_URL` | 서버(`/api`) | Postgres 연결 문자열 |
| `APP_PASSWORD` | 서버(`/api`) | 진입 및 쓰기 비밀번호 |

> `VITE_` 접두사가 붙은 값만 빌드 결과물에 포함된다. `DATABASE_URL`과 `APP_PASSWORD`는
> 절대 `VITE_`를 붙이지 말 것 — 붙이면 그대로 공개된다.

### 데이터베이스 연결 (Neon)

1. Vercel 프로젝트 → **Storage** → **Neon Postgres** 생성 후 프로젝트에 연결
2. `DATABASE_URL`이 자동으로 주입된다
3. 로컬로 가져오기: `vercel env pull .env.local` (또는 연결 문자열을 직접 붙여넣기)
4. `npm run db:setup` → `npm run db:seed`

`npm run db:setup`은 여러 번 실행해도 안전하다. `npm run db:seed`는 테이블이 비어 있을 때만
넣고, 시드로 되돌리려면 `npm run db:seed -- --force`를 쓴다(기존 데이터가 모두 지워진다).

### 카카오맵 앱 키 발급 (지도·주소 찾기에 필요)

1. [카카오 개발자센터](https://developers.kakao.com) → **내 애플리케이션** → 앱 생성
2. **앱 키 → JavaScript 키**를 복사해 `.env.local`의 `VITE_KAKAO_MAP_APP_KEY`에 붙여넣기
3. **앱 설정 → 플랫폼 → Web**에 사이트 도메인을 등록
   - `http://localhost:5173`
   - 배포 도메인 (예: `https://yanghwa-map.vercel.app`)

> 도메인을 등록하지 않으면 SDK 로딩이 거부된다.
> 키가 없어도 목록·필터·메모 기능은 정상 동작하며, 지도 영역에만 안내 문구가 표시된다.

### 진입 비밀번호

첫 화면은 로그인 화면이다. 입력한 값은 서버(`POST /api/login`)가 `APP_PASSWORD`와 대조한다.
통과하면 브라우저에 저장돼 이후 쓰기 요청의 `x-app-password` 헤더로 실린다.
헤더의 **잠금** 버튼으로 지울 수 있다.

- 쓰기(`POST`/`PATCH`/`DELETE`)는 비밀번호 없이는 401
- 읽기(`GET /api/restaurants`)는 공개

> 여러 사람이 하나의 비밀번호를 나눠 쓰는 방식이라 "링크를 아는 사람을 걸러내는" 수준의
> 잠금장치다. 다만 검증은 서버가 하므로 비밀번호가 빌드 결과물에 노출되지는 않는다.
> 계정별 권한이 필요해지면 세션 토큰 기반 인증으로 바꿔야 한다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 체크(`tsc -b`) + 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint |
| `npm run db:setup` | `restaurants` 테이블·인덱스 생성 (멱등) |
| `npm run db:seed` | 시드 47건 삽입 (`-- --force`로 재삽입) |
| `npm run seed` | 엑셀 → `src/data/seed-restaurants.json` 재생성 |

> 원본 엑셀(`list_template/`)은 개인 데이터라 저장소에 포함하지 않는다.
> 변환 결과인 `src/data/seed-restaurants.json`만 커밋되므로 `npm run seed`는 로컬에
> 엑셀이 있을 때만 필요하다.

## 데이터

### 저장 위치

PostgreSQL `restaurants` 테이블. 컬럼은 snake_case이고 `api/_lib/db.ts`가 앱의
`Restaurant` 타입으로 변환한다. 스키마는 `scripts/db-setup.mjs`에 있다.

목록은 `created_at` 내림차순이라 새로 추가한 곳이 위에 온다. 시드는 엑셀 순서를 유지하도록
과거 시각을 기준으로 넣으므로, 이후 추가되는 맛집은 항상 시드보다 위에 표시된다.

브라우저 localStorage에는 로그인 비밀번호(`yanghwa-map-auth`)와 필터 상태만 남는다.

### 엑셀 → 앱 필드 매핑

| 엑셀 열 | 앱 필드 | 비고 |
|---|---|---|
| 구역별(동) | `district` / `dong` / `areaRaw` | 서울 25개 구 이름으로 구를 추출, 원문도 보존 |
| 위치 | `memo` | 랜드마크 기반의 간단 위치 요약 |
| 상호 및 메뉴 | `name` / `menu` | `한촌설렁탕외 백반집` → 상호+메뉴로 분리 |
| 참 조 | `reference` | 영업시간·주차 등 |
| (없음) | `address` / `lat` / `lng` / `kakaoPlaceUrl` | 앱에서 **주소 찾기**로 채운다 |

원본 엑셀에는 도로명 주소가 없어 좌표가 비어 있다. 상세 화면의 **주소 찾기**에서 장소를
선택하면 주소·좌표·카카오맵 링크가 한 번에 채워지고 지도에 표시된다.

구 이름을 특정할 수 없던 3건(`천호사거리`, `양재동`, `경기도`)은 임의로 추정하지 않고
원문을 그대로 두었다 — 수정 화면에서 직접 정리하면 된다.

## 구조

```
api/
  _lib/db.ts             Neon 클라이언트, 입력 검증, row ↔ Restaurant 변환
  _lib/auth.ts           비밀번호 검증 + 공통 응답 헬퍼
  login.ts               POST /api/login
  restaurants/index.ts   GET · POST /api/restaurants
  restaurants/[id].ts    PATCH · DELETE /api/restaurants/:id
src/
  components/   FilterBar, RestaurantCard, RestaurantForm, PlaceSearchModal, KakaoMap, Layout
  pages/        ListPage(/), MapPage(/map), NewPage(/new), DetailPage(/:id), EditPage(/:id/edit)
  store/        useRestaurantStore(서버 캐시), useAuthStore, useFilterStore, selectors
  lib/api.ts    /api 호출 래퍼 (비밀번호 헤더, 오류 변환)
  lib/kakao.ts  SDK 동적 로딩 + 장소 검색 래퍼
  data/         seed-restaurants.json
scripts/
  db-setup.mjs         테이블 생성
  db-seed.mjs          시드 삽입
  vite-api-plugin.ts   개발 서버에서 /api 핸들러를 그대로 실행 (빌드 제외)
  xlsx-to-seed.mjs     엑셀 파서 (외부 의존성 없음)
```

`vite dev`는 원래 `/api`를 서비스하지 않는다. `scripts/vite-api-plugin.ts`가 Vercel의
파일 기반 라우팅을 흉내내 같은 핸들러를 개발 서버에 물려 주므로, `vercel dev` 없이
`npm run dev` 하나로 프런트와 API를 함께 띄울 수 있다.

## 배포 (Vercel)

GitHub 저장소를 연결하면 자동 감지된다. 확인할 것:

- **Storage → Neon Postgres**를 프로젝트에 연결 (`DATABASE_URL` 자동 주입)
- 환경 변수 `VITE_KAKAO_MAP_APP_KEY`, `APP_PASSWORD` 등록
- 배포 도메인을 카카오 개발자센터 Web 플랫폼에 추가

`api/` 아래 파일은 Vercel이 서버리스 함수로 배포한다. `vercel.json`의 SPA rewrite는
`/api/`를 제외하도록 되어 있어(`/((?!api/).*)`) API 요청이 `index.html`로 새지 않는다.
