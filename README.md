# YanghwaMap

내가 가본 맛집을 **구역별로 정리**하고, 아직 모르는 곳은 **근처 맛집을 추천**받고,
급할 때 **근처 공중화장실**을 찾고, 운전 중에 필요한 **주유소·주차장·충전소·고속도로·보조금**을
한 탭에서 조회하는 모바일 우선 웹앱.

원본은 개인 엑셀 목록이었다. 구/동이 한 칸에 뒤섞여 있고 주소도 좌표도 없어서 지도에 찍을 수 없었다.
이걸 파싱해 PostgreSQL(Neon)에 넣고, 카카오맵 장소 검색으로 주소·좌표를 채워 넣는 앱으로 만들었다.
데이터는 서버에 있으므로 기기·브라우저가 달라도 같은 목록을 본다.

```
브라우저 (React SPA)  ──fetch──▶  /api (Vercel Serverless)  ──▶  PostgreSQL (Neon)
      │                                    │
      │                                    ├── 카카오 REST API (주소 → 좌표, 좌표 → 행정구역)
      │                                    ├── PlayMCP 게이트웨이 (MCP · 맛집 추천)
      └── 카카오맵 SDK (지도·장소검색)         └── 공공 API (오피넷 · 공공데이터포털 · 도로공사 · ITS · 환경부)
```

맛집·화장실은 우리 DB에 있고, 추천·운전 탭은 저장하지 않는다 — 요청 때마다 원본 기관을 부르고
CDN 캐시(`Cache-Control`)로만 아낀다. 브라우저가 직접 부를 수 없는 이유는 셋이다:
CORS를 열어 주는 기관이 없고, 인증키가 노출되며, 응답이 크다(도로공사 소통 정보는 한 번에 8천 행·1.5MB).

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

### 추천 (지도 탭 옆)

내 목록이 '가 본 곳'이라면 이 탭은 '아직 모르는 곳'이다. 카카오 PlayMCP에 올라온
[맛집검색 MCP 서버](https://playmcp.kakao.com/mcp/200)를 서버가 대신 불러, 카카오 로컬 검색 후보를
다음 블로그 글로 다시 매긴 순위를 지도 + 목록으로 보여 준다.

| 기능 | 설명 |
|---|---|
| **현재 위치 기준** | 가까운 지하철역 세 곳까지 찾아 각각 검색하고 합친다. 역이 없는 동네는 `시도 시군구 동` 으로 묻는다 |
| **키워드** | `파스타`·`국밥` 같은 메뉴 칩 또는 직접 입력. 비워 두면 그 지역 전체 |
| **정렬** | 추천순(도구가 매긴 점수) / 거리순 전환 |
| **근거 표시** | 요약을 지어내지 않고 근거가 된 블로그 글 제목·날짜·원문 링크를 그대로 건다. 블로그 언급 수, 최근 6개월 글 수, 광고로 걸러 낸 글 수도 함께 |
| **걸러 내기** | 만화카페·보드카페처럼 '음식점'이 아닌 후보와 커피 체인을 뺀다 (카페를 찾는 중이면 되살린다) |

밝혀 두는 한계 — 화면 하단에도 같은 내용을 적어 둔다:

- 검색이 **역·동 단위**라 현재 위치에서 가장 가까운 집이 아닐 수 있다
- 한 지역에서 **최대 세 곳**만 온다. 그래서 역 세 곳을 합쳐 보통 4~9곳이 된다
- 지역 이름에 따라 도구가 **후보를 아예 만들지 못한다**('합정역'은 되고 '합정동'은 안 된다).
  빠진 지역은 화면에 그대로 적는다
- 게이트웨이 호출 한도가 **초당 3회(버스트 15)** 라 연달아 새로고침하면 잠시 막힌다

### 공중화장실

| 기능 | 설명 |
|---|---|
| **지역구 모드** | 자치구 칩으로 골라 이름순 전체 목록. 좌표가 없어도 목록은 동작한다 |
| **내 주변 모드** | 현재 위치 기준 반경 300m / 500m / 1km 안에서 거리순. 위치 권한이 없으면 합정역 기준으로 폴백 |
| **좌표 불러오기** | 고른 자치구의 빈 좌표를 서버가 카카오 주소검색으로 채운다. 배치로 나눠 돌고 진행 상황을 표시 |
| **지도 연동** | 마커 클릭 → 목록 항목으로 스크롤, 목록 선택 → 지도 이동 + 인포윈도우 |
| **상세 정보** | 개방시간, 남/녀 변기 수, 장애인용, 기저귀 교환대, 비상벨, CCTV, 관리기관 |

### 운전

기능마다 헤더 탭을 늘리면 좁은 화면에서 넘치므로 `/drive` 안에서 하위 칩으로 나눈다.
위치는 화면이 한 번만 잡아 패널들에 넘기고, 위치가 필요 없는 보조금 탭에서는 권한 창을 띄우지 않는다.

| 탭 | 출처 | 설명 |
|---|---|---|
| **주유소** | 오피넷 | 반경 안에서 유종별(휘발유·경유·고급·LPG) 가격순. 최저가와의 차이를 함께 표시. 상위 5곳은 상세(셀프·세차장·경정비·품질인증)까지 채운다 |
| **주차장** | 공공데이터포털 | 시군구 단위로 받아 반경·거리순 정렬. 공영만/민영 포함 전환, 기본요금·구획수·평일 운영시간 |
| **충전소** | 환경부 | 충전기 단위 응답을 충전소로 묶어 `충전 가능 n/m대`. 급속 여부·커넥터 종류·주차무료·이용제한 |
| **고속도로** | 도로공사 · ITS | 콘존별 소통(원활/서행/정체·평균속도)을 막히는 순으로. CCTV는 지도에 찍고 스트림 주소를 복사 |
| **보조금** | 환경부 | 지자체별 공고·접수·출고·출고잔여와 모델별 국비/지방비. 차종·시도·이름으로 필터 |

밝혀 두는 한계 — 화면 하단에도 같은 내용을 적어 둔다:

- 주차장 표준데이터에는 **실시간 잔여 면수·만차 여부가 없다.** 있는 척하지 않는다
- 출고잔여는 `공고 − 출고`일 뿐이라 실제 신청 가능 대수와 다르다. **잔여가 남아도 비고가 마감이면 마감으로 표시**한다
- 오피넷은 인증키가 거부돼도 오류가 아니라 **빈 목록**을 준다. '반경 안에 없음'과 구분할 수 없어 빈 화면에서 두 가능성을 함께 알린다
- ITS 공개 데모 키는 **좌표 범위를 무시하고 늘 같은 표본 20건**을 준다. 그때는 반경으로 자르지 않고 '표본'이라고 밝힌다 (개인 키를 넣으면 실제 반경이 적용된다)
- CCTV 주소는 서명된 HLS라 만료되고 `http`라서 이 화면에서 재생할 수 없다. 복사해 외부 플레이어로 연다

### 공통

- **비밀번호 잠금** — 첫 화면이 로그인. 검증은 서버(`APP_PASSWORD`)가 하므로 빌드 결과물에 비밀번호가 들어가지 않는다. 읽기는 공개, 쓰기는 인증 필요
- **키 없이도 죽지 않음** — 카카오 앱 키가 없으면 지도 영역에만 안내 문구가 뜨고 목록·필터·검색은 그대로 동작한다.
  운전 탭도 마찬가지로 인증키가 없는 하위 탭만 `503` + 발급 안내로 끝나고 나머지 탭은 정상 동작한다
  (고속도로와 보조금은 키 없이도 동작한다)

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
| **추천** | PlayMCP MCP 게이트웨이 (Streamable HTTP + OAuth2) | 서버가 직접 JSON-RPC 로 부른다. 토큰은 DB에 보관 |
| **지오코딩** | 카카오 로컬 REST API | 주소·장소명 → 좌표, 좌표 → 행정구역. 오피넷용 KATEC 변환만 직접 계산 ([지오코딩](#지오코딩)) |
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
| `KAKAO_REST_API_KEY` | 서버 `/api` + 스크립트 | △ | 카카오 **REST API** 키. 화장실 좌표 채우기 + 운전 탭의 좌표 → 행정구역 변환 |
| `DATA_GO_KR_API_KEY` | 서버 `/api` | △ | 공공데이터포털. 주차장·충전소 탭. 데이터셋별 활용신청 필요 |
| `OPINET_API_KEY` | 서버 `/api` | △ | 오피넷. 주유소 탭 |
| `EXDATA_API_KEY` | 서버 `/api` | ✕ | 한국도로공사. 없으면 공개 데모 키 `test` 를 쓴다 |
| `ITS_API_KEY` | 서버 `/api` | ✕ | 국가교통정보센터. 없으면 데모 키를 쓰지만 **CCTV 반경이 적용되지 않는다** |
| `PLAYMCP_REFRESH_TOKEN` | 서버 `/api` | △ | PlayMCP 맛집검색. 추천 탭. 보통은 `npm run playmcp:token` 으로 DB에 넣으므로 비워 둬도 된다 |

운전 탭 인증키는 기관이 다섯 곳이고 함정이 몇 개 있다(데이터셋별 활용신청, Encoding/Decoding 키,
오피넷의 빈 목록 응답 등). 발급 절차와 오류별 대응은 **[docs/api-keys.md](docs/api-keys.md)** 에 따로 정리했다.

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
| `npm run playmcp:token -- <oneTimeToken>` | PlayMCP 연결 토큰을 DB에 저장 (추천 탭) |
| `npm run restaurants:geocode` | 맛집 메모의 랜드마크 → 좌표 추정 (`-- --dry`로 조회만) |

---

## 폴더 구조

```
api/                          Vercel Serverless Functions (파일 기반 라우팅)
  _lib/db.ts                  Neon 클라이언트, 필드 검증(FIELDS), row ↔ Restaurant 변환
  _lib/auth.ts                비밀번호 검증(timingSafeEqual) + 공통 오류 응답
  _lib/restrooms.ts           자치구별 목록, 근처 조회(bbox + haversine), 쿼리 파싱
  _lib/geocode.ts             카카오 주소검색 배치 지오코딩 (서버 측)
  _lib/upstream.ts            외부 API 공통 호출 (브라우저 UA·타임아웃·502/503 구분)
  _lib/datagokr.ts            공공데이터포털 공통 (두 가지 오류 봉투 해석, 안내 문구 변환)
  _lib/katec.ts               WGS84 ↔ KATEC 양방향 변환 (오피넷 좌표계)
  _lib/region.ts              좌표 → 시도/시군구 + zcode/zscode
  _lib/geo.ts                 서버 haversine
  _lib/gas.ts                 오피넷 반경 검색 + 상세
  _lib/parking.ts             주차장 표준데이터
  _lib/chargers.ts            전기차 충전소 정보 + 상태 병합
  _lib/highway.ts             도로공사 소통 + ITS CCTV
  _lib/pnp.ts                 ev.or.kr pnp4web 보호 해제 (eval 없이 문자표만 읽어 직접 디코딩)
  _lib/subsidy.ts             전기차 보조금 지급현황 + 모델별 보조금
  login.ts                    POST   /api/login
  restaurants/index.ts        GET·POST      /api/restaurants
  restaurants/[id].ts         PATCH·DELETE  /api/restaurants/:id
  restrooms/index.ts          GET    /api/restrooms
  restrooms/districts.ts      GET    /api/restrooms/districts
  restrooms/geocode.ts        POST   /api/restrooms/geocode
  drive/gas.ts                GET    /api/drive/gas
  drive/parking.ts            GET    /api/drive/parking
  drive/chargers.ts           GET    /api/drive/chargers
  drive/highway.ts            GET    /api/drive/highway
  drive/subsidy.ts            GET    /api/drive/subsidy

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
| `GET` | `/api/drive/gas?lat=&lng=` | 공개 | 가격순 주유소. `radius`(500~5000, 기본 3000), `product`(B027 휘발유 / D047 경유 / B034 / K015) |
| `GET` | `/api/drive/parking?lat=&lng=` | 공개 | 거리순 주차장. `radius`(300~5000, 기본 1500), `publicOnly=0`이면 민영 포함 |
| `GET` | `/api/drive/chargers?lat=&lng=` | 공개 | 거리순 충전소. `radius`(300~5000, 기본 2000), `availableOnly=1`이면 충전 가능만 |
| `GET` | `/api/drive/highway?kind=traffic` | 공개 | 콘존별 소통. `route`(노선명/번호), `keyword`, `limit`(5~100, 기본 30) |
| `GET` | `/api/drive/highway?kind=cctv&lat=&lng=` | 공개 | 거리순 CCTV. `radius`(2000~30000, 기본 10000), `roadType`(ex/its/all) |
| `GET` | `/api/drive/subsidy` | 공개 | 지자체별 보조금 현황. `vehicle`(passenger/cargo/bus), `year` |
| `GET` | `/api/drive/subsidy?kind=models&localCode=` | 공개 | 그 지자체의 모델별 국비/지방비 |

외부 기관이 실패하면 `502`, 인증키가 없어 호출조차 못 하면 `503` 으로 구분한다.
`503` 메시지에는 어디서 키를 발급받는지가 들어 있어 화면에 그대로 띄울 수 있다.

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
- **`api/` 안의 상대 import 에는 반드시 `.js` 확장자** — [트러블슈팅 1](docs/troubleshooting.md#1-배포본만-500--err_module_not_found) 참고.

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

## 지오코딩

이 앱에서 좌표는 네 방향으로 오간다. 셋은 카카오 로컬 REST API를 쓰고, 하나는 순수 계산이다.
**전부 서버(`/api`)나 로컬 스크립트에서 한다** — 브라우저는 카카오 REST를 부를 수 없다
(CORS + 키 노출, [트러블슈팅 5](docs/troubleshooting.md#5-브라우저에서-카카오-rest-api를-직접-못-부른다)).

| 방향 | 쓰는 곳 | 구현 | 왜 필요한가 |
|---|---|---|---|
| 주소 → 좌표 | 화장실 | `api/_lib/geocode.ts`, `scripts/restroom-geocode.mjs` | 표준데이터에 좌표가 없다 |
| 장소명 → 좌표 | 맛집 | `PlaceSearchModal`, `scripts/restaurant-geocode.mjs` | 엑셀에 주소·좌표가 없었다 |
| **좌표 → 행정구역** | 주차장·충전소 | `api/_lib/region.ts` | 공공 API에 반경 검색이 없다 |
| **WGS84 ↔ KATEC** | 주유소 | `api/_lib/katec.ts` | 오피넷만 좌표계가 다르다 |

앞의 둘은 [데이터](#데이터) 항목에 파이프라인이 따로 있다. 아래는 운전 탭이 추가하면서 생긴 둘이다.

### 좌표 → 행정구역 (역지오코딩)

주차장·충전소 표준데이터에는 **반경 검색이 없다.** 시도/시군구로만 거를 수 있어서,
브라우저가 준 좌표를 먼저 행정구역으로 바꿔야 조회가 시작된다.

```
브라우저 위치 ──▶ 카카오 coord2regioncode ──▶ 시군구로 목록 조회 ──▶ 거리 계산·정렬
   (WGS84)              (region.ts)              (기관 API)          (서버 haversine)
```

카카오 응답에서 **법정동(`region_type: 'B'`)** 을 고른다. 행정동(`'H'`)은 코드 체계가 달라
충전소 API가 받지 않는다. 여기서 나온 10자리 법정동 코드를 잘라 두 기관에 맞춰 쓴다.

| 뽑는 값 | 예 | 쓰는 곳 |
|---|---|---|
| `addressHint` | `서울특별시 마포구` | 주차장 — 주소 문자열로 거른다 |
| `zcode` (앞 2자리) | `11` | 충전소 — 시도 코드 |
| `zscode` (앞 5자리) | `11440` | 충전소 — 시군구 코드 |

- 주차장은 지자체마다 채워 넣은 주소 칸이 달라 **도로명 → 지번 → 시군구명** 순으로 세 번 물어본다.
  마지막 시도는 시도 표기가 어긋날 때를 위한 것이다(`서울특별시` / `서울시`)
- 이 단계가 실패하면 기관 API는 부르지도 않는다. 그래서 주차장 화면에 기관 오류가 떴다면
  **역지오코딩은 이미 통과했다는 뜻**이다 — 원인을 좁힐 때 쓸 만하다

### WGS84 ↔ KATEC

오피넷만 좌표계가 다르다. 반경 검색 기준점을 **KATEC**으로 받고, 돌려주는 주유소 좌표도 KATEC이다.
우리는 처음부터 끝까지 WGS84(브라우저 geolocation · 카카오맵)를 쓰므로 **양방향**이 다 필요하다.

```
보낼 때  내 위치(WGS84) ──▶ KATEC ──▶ aroundAll.do
받을 때  주유소 좌표(KATEC) ──▶ WGS84 ──▶ 지도 마커
```

KATEC은 Bessel 1841 타원체 위의 횡단 메르카토르다. WGS84와 타원체가 달라 투영 전에
3매개변수 데이텀 변환(Molodensky)을 거친다. 외부 라이브러리 없이 직접 구현했다 —
이 저장소가 haversine·CP949 디코딩·XLSX 파싱을 그렇게 하는 것과 같은 이유다.

원점은 위도 38° · 경도 128°, 가산값 400,000 / 600,000m, 축척 0.9999. 높이는 0으로 둔다
(지표면의 점만 다루고, 고도를 무시해 생기는 오차는 미터 이하다).

왕복 변환 오차를 확인해 두면 이후 값이 어긋났을 때 변환식을 의심할지 판단할 수 있다:

| 지점 | KATEC (x, y) | 왕복 오차 |
|---|---|---|
| 합정역 | 304211, 550257 | 5.15mm |
| 서울시청 | 309913, 552080 | 5.15mm |
| 부산역 | 495116, 280089 | 4.53mm |
| 제주시청 | 263718, 101370 | 4.42mm |

다만 왕복 오차는 **변환식끼리 서로 맞는다**는 것만 보여 준다. 오피넷의 실제 좌표와 맞는지는
실데이터로 따로 확인했다. 오피넷이 직접 계산해 준 거리(`DISTANCE`)와, 돌려받은 KATEC을 WGS84로
바꿔 우리가 다시 잰 거리를 합정역 기준 8곳에서 비교했다:

| 비교 | 결과 |
|---|---|
| 오피넷 `DISTANCE` vs 역변환 좌표로 잰 거리 | **최대 6m, 평균 3m** 차이 (반경 1~3km 구간) |

몇 미터 차이는 오피넷 쪽 반올림·거리 계산 방식 차이 수준이다. 변환식이 틀렸다면 수백 미터씩 어긋난다.

> 오피넷 응답의 `GIS_X_COOR`/`GIS_Y_COOR`를 WGS84로 착각하면 마커가 엉뚱한 곳에 찍힌다.
> 값의 자릿수(30만·55만)로 바로 구분된다.

### 공통 규칙

- **한국 범위 검사** — 위도 33~39, 경도 124~132를 벗어나면 버린다(`api/_lib/geo.ts`의 `inKorea`).
  카카오가 엉뚱한 점을 집어 주거나 원본에 `0,0`이 섞여 있는 경우를 여기서 막는다
- **거리는 세 곳이 같은 식을 쓴다** — Postgres(화장실 SQL) · 서버(운전 탭) · 브라우저(위치 갱신 시 재정렬).
  하나라도 다르면 같은 목록에서 거리가 어긋난다
- **좌표의 출처를 남긴다** — 화장실은 `coord_source`로 `road`/`jibun`/`keyword`/`venue`를 구분하고,
  시설 대표 좌표(`venue`)는 카드에 `위치 대략`을 띄운다. 맛집의 `landmark`도 같은 규칙이다

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

만들면서 부딪힌 문제와 그렇게 해결한 이유는 **[docs/troubleshooting.md](docs/troubleshooting.md)** 로 분리했다.

| 분류 | 다루는 것 |
|---|---|
| 배포·개발 환경 | Vercel ESM의 `.js` 확장자, `vite dev`에서 `/api` 띄우기, 서버 전용 환경 변수 |
| 데이터·지오코딩 | 좌표 없는 표준데이터, 서버 경유 지오코딩, 실패 행 무한 루프, 자치구 추출, CP949 |
| 화면 동작 | 늦게 도착한 응답, 중복 요청, 카카오맵 SDK 로딩 |
| 인증 | 타이밍 공격에 안전한 비밀번호 비교 |
| 운전 탭 외부 API | 공공데이터포털 403, 도로공사 UA 차단, ITS 데모 키, 오피넷 빈 목록 |

증상으로 바로 찾으려면 [자주 겪는 증상](docs/troubleshooting.md#자주-겪는-증상) 표를 보면 된다.
운전 탭 인증키 문제는 [docs/api-keys.md](docs/api-keys.md) 에 발급 절차와 함께 따로 있다.
