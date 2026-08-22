# YanghwaMap

내가 가본 맛집을 **구역별로 정리**하고 **카카오맵**에서 위치를 확인하는 웹앱.
데이터는 **PostgreSQL(Neon)** 에 저장하고 **Vercel Serverless Functions**(`/api`)로 읽고 쓴다.
기기·브라우저가 달라도 같은 목록을 본다.

## 기능

- **구역 필터** — 구(1단계) → 동(2단계) 칩 필터, 건수 표시
- **검색** — 상호 / 메뉴 / 메모 / 참조 / 주소 통합 검색
- **카카오맵 연동** — 장소 키워드 검색 한 번으로 주소·좌표·카카오맵 링크를 자동 입력
- **지도 화면** — 필터 결과를 마커로 표시, 마커 클릭 시 상세로 이동
- **화장실 화면** — 자치구별 목록(이름순) 또는 현재 위치 기준 거리순으로 공중화장실 조회
- **항목별 정보** — 상호, 메뉴, 구/동, 주소, 추가 메모(간단 위치 요약), 참조, 방문 여부

## 시작하기

```bash
npm install
cp .env.example .env.local   # 아래 환경 변수 채우기
npm run db:setup             # restaurants / restrooms 테이블 생성 (한 번만)
npm run db:seed              # 엑셀 시드 47건 삽입
npm run db:seed:restrooms    # 공중화장실 시드 삽입 (아래 '공중화장실 데이터' 참고)
npm run dev                  # http://localhost:5173 (프런트 + /api 함께 뜬다)
```

### 환경 변수

| 이름 | 어디서 읽나 | 설명 |
|---|---|---|
| `VITE_KAKAO_MAP_APP_KEY` | 클라이언트 | 카카오맵 JavaScript 키 |
| `DATABASE_URL` | 서버(`/api`) | Postgres 연결 문자열 |
| `KAKAO_REST_API_KEY` | 서버(`/api`) + 빌드 스크립트 | 카카오 REST API 키. 좌표 채우기에만 쓴다 (지도 표시에는 불필요) |
| `APP_PASSWORD` | 서버(`/api`) | 진입 및 쓰기 비밀번호 |

> `VITE_` 접두사가 붙은 값만 빌드 결과물에 포함된다. `DATABASE_URL`과 `APP_PASSWORD`는
> 절대 `VITE_`를 붙이지 말 것 — 붙이면 그대로 공개된다.

`VITE_APP_PASSWORD`와 `APP_PASSWORD`는 **다른 변수다.** 로그인 검증은 서버가 하므로
접두사 없는 `APP_PASSWORD`만 사용된다. 값에 따옴표를 붙이면 따옴표까지 비밀번호가 된다.

로컬과 Vercel에 **같은 값**을 넣어야 한다. Vercel 환경 변수는 등록만으로는 반영되지 않고
**다음 배포부터** 적용되므로, 값을 바꿨다면 재배포해야 한다.

### 데이터베이스 연결 (Neon)

1. Vercel 프로젝트 → **Storage** → **Create Database** → **Neon Postgres**를 만들어 프로젝트에 연결
2. 배포 환경에는 `DATABASE_URL`이 자동으로 주입된다
3. 로컬에서 쓸 값은 **Storage → (생성한 DB) → Connect**의 연결 문자열을 복사한다

```
DATABASE_URL=postgres://<user>:<password>@<host>.neon.tech/<db>?sslmode=require
```

Vercel CLI로 한 번에 받아올 수도 있다:

```bash
npx vercel link              # 최초 1회
npx vercel env pull .env.local
```

> `vercel env pull`은 `.env.local`을 **덮어쓴다.** 실행 후 `APP_PASSWORD`와
> `VITE_KAKAO_MAP_APP_KEY`가 남아 있는지 확인할 것 (Vercel에 등록해 두지 않았다면 사라진다).

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
| `npm run db:setup` | `restaurants` / `restrooms` 테이블·인덱스 생성 (멱등) |
| `npm run db:seed` | 시드 47건 삽입 (`-- --force`로 재삽입) |
| `npm run db:seed:restrooms` | 공중화장실 시드 삽입 (`-- --force`로 재삽입) |
| `npm run seed` | 엑셀 → `src/data/seed-restaurants.json` 재생성 |
| `npm run restrooms:fetch` | 공공데이터 CSV 내려받아 → `src/data/seed-restrooms.json` |
| `npm run restrooms:geocode` | 주소 → 좌표 채우기 (카카오 REST 키 필요, 거리순/지도용) |

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

### 공중화장실 데이터

`화장실` 탭이 쓰는 `restrooms` 테이블은 공공데이터포털 **전국공중화장실표준데이터**에서 만든다.

```bash
npm run restrooms:fetch       # 전국 CSV 내려받아 서울만 추려 seed JSON 생성
npm run db:setup              # restrooms 테이블 생성 (멱등)
npm run db:seed:restrooms     # DB 삽입 — 여기까지만 해도 자치구별 목록은 동작한다
npm run restrooms:geocode     # 주소 -> 좌표 (KAKAO_REST_API_KEY 필요, 거리순/지도용)
npm run db:seed:restrooms -- --force
```

**왜 지오코딩이 따로 필요한가** — 이 표준데이터는 2025년 2월부로 `WGS84 위도/경도` 제공이
중단되어 CSV에 좌표 컬럼이 아예 없다. 그래서 `lat`/`lng` 는 nullable 이고, **좌표 없이도
자치구별 목록은 그대로 동작한다.** 거리순 정렬과 지도 마커만 좌표를 필요로 한다.

좌표를 채우는 길은 두 가지고, 규칙(도로명 → 지번 → `구 + 화장실명` 키워드 순, 주소 정리,
좌표 범위 검사)은 같다.

| | 어디서 | 쓸 때 |
|---|---|---|
| `npm run restrooms:geocode` | 로컬 스크립트 → seed JSON | 전량 일괄. 결과를 커밋해 재사용 |
| 화장실 탭 **좌표 불러오기** 버튼 | 서버 API → DB 직접 | 고른 자치구만. 새 데이터가 들어왔을 때 |

앱 안에서 채울 때는 `지역구` 모드에서 구를 고르고 **좌표 불러오기** 를 누른다. 브라우저는
카카오 REST API를 직접 부를 수 없어(CORS·키 노출) 서버가 대신 호출하며, 서버리스 실행 시간
제한 때문에 한 번에 60건씩 처리하고 클라이언트가 남은 수가 0이 될 때까지 이어서 부른다.
쓰기 요청이라 로그인이 필요하다.

좌표를 못 찾은 행은 `geocode_failed_at` 에 표시해 다음 배치가 같은 행을 다시 붙잡지 않게 한다.
목록에는 `좌표 찾기 실패` 로 구분해 보이고, 버튼이 **실패 N곳 다시 시도** 로 바뀐다
(`?retry=1` — 표시를 지우고 재시도).

**자치구는 어떻게 정하나** — 주소 문자열만으로는 부족하다. `용산구녹사평대로11길`처럼 붙여 쓴
주소가 있고, 비탐욕 정규식은 `압구정로`를 `압구`로 잘라 낸다. 그래서 서울 25개 구 이름을
주소·관리기관명에서 찾고(5,385건), 실패분은 `개방자치단체코드`가 같은 행들의 최빈 구로
채운다(208건). 코드→구 매핑은 하드코딩하지 않고 해결된 행들에서 만들며, 한 코드가 여러 구에
걸치면(순도 95% 미만) 추측하지 않는다. 결과는 25개 구 5,593건 전부 분류.

- `KAKAO_REST_API_KEY`는 지도용 `VITE_KAKAO_MAP_APP_KEY`(JavaScript 키)와 **다른 값**이다.
  카카오 개발자센터 > 내 애플리케이션 > 앱 키 > **REST API 키**. 같은 앱에서 함께 발급된다.
- 결과인 `src/data/seed-restrooms.json`이 커밋되므로 **앱 실행·배포에는 REST 키가 필요 없다.**
- 중간 저장하므로 끊겨도 다시 실행하면 남은 행부터 이어서 진행한다.
- 원본 CSV(16MB)는 `list_template/`에 받아 두며 커밋하지 않는다.
- 다른 지역: `node scripts/restroom-csv-to-seed.mjs --region 부산광역시` (또는 `--all`)

원본은 하루 단위로만 갱신되고 **실시간 개방/점검 상태는 보장하지 않는다.** 화면 하단에도
같은 주의 문구를 띄운다.

## 구조

```
api/
  _lib/db.ts             Neon 클라이언트, 입력 검증, row ↔ Restaurant 변환
  _lib/auth.ts           비밀번호 검증 + 공통 응답 헬퍼
  _lib/restrooms.ts      자치구별 목록 + 근처 조회 (bbox + haversine)
  login.ts               POST /api/login
  restaurants/index.ts   GET · POST /api/restaurants
  restaurants/[id].ts    PATCH · DELETE /api/restaurants/:id
  restrooms/index.ts     GET /api/restrooms (?district= | ?lat=&lng=)
  restrooms/districts.ts GET /api/restrooms/districts
src/
  components/   FilterBar, RestaurantCard, RestroomCard, RestaurantForm, PlaceSearchModal,
                KakaoMap, Layout
  pages/        ListPage(/), MapPage(/map), RestroomPage(/restroom), NewPage(/new),
                DetailPage(/:id), EditPage(/:id/edit)
  store/        useRestaurantStore(서버 캐시), useAuthStore, useFilterStore, selectors
  hooks/        useKakaoSdk, useCurrentPosition, useNearbyRestrooms, useDistrictRestrooms
  lib/api.ts    /api 호출 래퍼 (비밀번호 헤더, 오류 변환)
  lib/kakao.ts  SDK 동적 로딩 + 장소 검색 래퍼
  lib/geo.ts    haversine 거리 · 거리 표기
  data/         seed-restaurants.json, seed-restrooms.json
scripts/
  db-setup.mjs              테이블 생성
  db-seed.mjs               맛집 시드 삽입
  db-seed-restrooms.mjs     화장실 시드 삽입 (배치 INSERT)
  restroom-csv-to-seed.mjs  공공데이터 CSV 파서 (CP949, 외부 의존성 없음)
  restroom-geocode.mjs      카카오 주소검색으로 좌표 채우기
  vite-api-plugin.ts        개발 서버에서 /api 핸들러를 그대로 실행 (빌드 제외)
  xlsx-to-seed.mjs          엑셀 파서 (외부 의존성 없음)
```

`vite dev`는 원래 `/api`를 서비스하지 않는다. `scripts/vite-api-plugin.ts`가 Vercel의
파일 기반 라우팅을 흉내내 같은 핸들러를 개발 서버에 물려 주므로, `vercel dev` 없이
`npm run dev` 하나로 프런트와 API를 함께 띄울 수 있다.

### API

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/api/login` | — | `{ password }` 검증. 200 / 401 / 503 |
| `GET` | `/api/restaurants` | 공개 | 전체 목록 (`created_at` 내림차순) |
| `POST` | `/api/restaurants` | 필요 | 등록. 201 + 생성된 항목 |
| `PATCH` | `/api/restaurants/:id` | 필요 | 부분 수정. 200 + 수정된 항목 |
| `DELETE` | `/api/restaurants/:id` | 필요 | 삭제. 204 |
| `GET` | `/api/restrooms` | 공개 | `?district=마포구` 자치구 목록 / `?lat=&lng=&radius=&limit=` 거리순 |
| `GET` | `/api/restrooms/districts` | 공개 | 자치구 목록 + 건수 (`district`, `total`, `located`) |
| `POST` | `/api/restrooms/geocode` | 필요 | `?district=마포구[&retry=1]` 좌표 채우기 (한 배치) |

인증이 필요한 요청은 `x-app-password` 헤더를 보낸다. 오류는 `{ "error": "..." }` 형태이며
그대로 화면에 표시되므로 사용자가 읽을 문장으로 쓴다.

`:id`는 uuid다. 형식이 아니면 DB를 조회하지 않고 404를 준다.
본문은 필드별로 검증하며(`api/_lib/db.ts`의 `FIELDS`), 모르는 키는 무시하므로
`id`나 `createdAt`을 실어 보내도 덮어쓰이지 않는다. 필드를 추가할 때는 `FIELDS`에만
넣으면 되고, `RestaurantDraft`와 어긋나면 `satisfies`가 빌드에서 잡는다.

> **`api/` 안의 상대 import 에는 반드시 `.js` 확장자를 붙일 것.**
> Vercel 은 이 파일들을 번들하지 않고 파일별로 트랜스파일해 Node ESM 으로 실행하는데,
> ESM 은 확장자를 요구한다. `tsconfig.api.json` 이 `moduleResolution: nodenext` 라
> 빠뜨리면 `npm run build` 가 TS2835 로 잡아 준다.

## 배포 (Vercel)

GitHub 저장소를 연결하면 자동 감지된다. 확인할 것:

- **Storage → Neon Postgres**를 프로젝트에 연결 (`DATABASE_URL` 자동 주입)
- 환경 변수 `VITE_KAKAO_MAP_APP_KEY`, `APP_PASSWORD` 등록
- 배포 도메인을 카카오 개발자센터 Web 플랫폼에 추가

`api/` 아래 파일은 Vercel이 서버리스 함수로 배포한다(`_`로 시작하는 파일은 라우트가 되지
않는다). `vercel.json`의 SPA rewrite는 `/api/`를 제외하도록 되어 있어(`/((?!api/).*)`)
API 요청이 `index.html`로 새지 않는다.

## 문제 해결

| 증상 | 원인 |
|---|---|
| 로그인 화면에서 "서버에 APP_PASSWORD가 설정되지 않았습니다" | `APP_PASSWORD` 미설정. `VITE_APP_PASSWORD`는 다른 변수다 |
| 비밀번호가 맞는데 401 | 로컬과 Vercel 값이 다르거나, 값에 따옴표가 붙었다 |
| 환경 변수를 바꿨는데 그대로다 | 개발 서버 재시작 필요. Vercel은 재배포해야 반영된다 |
| 목록 화면이 "다시 시도"만 보인다 | `DATABASE_URL` 미설정이거나 `db:setup`을 아직 안 돌렸다 |
| 배포본만 500 (`ERR_MODULE_NOT_FOUND`) | `api/`의 상대 import에 `.js` 확장자가 빠졌다 |
