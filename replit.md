# 내부 CRM 시스템

## 개요
내부 팀을 위한 고객 관계 관리(CRM) 시스템입니다. 고객, 거래, 활동을 추적하고 관리할 수 있습니다.

## 기능
- **로그인/인증**: 세션 기반 로그인, 로그아웃
- **대시보드**: 주요 통계 및 최근 활동 확인
- **고객 관리**: 고객 추가/수정/삭제, 검색, 상태 관리
- **거래 관리**: 영업 기회 추적, 단계별 관리, 금액 및 확률 설정
- **활동 내역**: 통화/미팅/이메일/메모 기록 및 조회
- **계약 관리**: 계약 등록/수정, 상품 항목, 부가세, 수납확인
- **수납 관리**: 입금 관리 및 확인
- **입금확인 목록**: 엑셀 업로드, 입금내역 확인, 계약 매칭 (부서별 계약 필터)
- **환불 관리**: 환불 내역 조회, 일자별 필터링, 고객/처리자 필터
- **상품 관리**: 상품 등록/수정/삭제
- **매출분석**: 매출 통계 및 분석
- **사용자관리**: 사용자 등록/수정, 근무상태 관리
- **조직도**: 조직 구조 관리
- **시스템로그**: 시스템 활동 로그
- **권한설정**: 페이지별 멤버 접근 권한 관리 (대표이사/총괄이사/개발자만 수정 가능)
- **견적서**: 견적서 작성/조회/인쇄 (모든 사용자 접근 가능)
- **개발자 어드민**: DB 스키마 확인, 데이터 CRUD, SQL 콘솔 (개발자 전용)
- **백업관리**: 데이터베이스 백업/복원 (개발자 전용)
- **대량등록**: Excel 파일 업로드를 통한 계약/고객/상품 일괄 등록 (관리자 전용, 슬롯/바이럴 시트 자동 감지)

## 인증 시스템
- 세션 기반 인증 (express-session + connect-pg-simple)
- 로그인 필수: 모든 페이지 접근 시 로그인 필요
- 관리자 계정 (시드 데이터):
  - plejoy / qwqaz108@ (대표이사)
  - earth / do220503!@# (총괄이사)
  - taesoo / xotn68004! (개발자)
- 권한설정은 위 3개 계정만 수정 가능 (프론트엔드 + 백엔드 모두 제한)

## 보안 설정 (2026-02-10)
- **Rate Limiting**: 로그인 15분당 10회, API 1분당 200회 (express-rate-limit)
- **보안 헤더**: Helmet (X-Content-Type-Options, X-Frame-Options, X-Powered-By 제거)
- **세션 보안**: 로그인 시 세션 재생성 (Session Fixation 방지), 로그아웃 시 쿠키 삭제
- **비밀번호 정책**: 최소 8자 + 영문 + 숫자 + 특수문자 (프론트+백엔드 동시 검증)
- **API 응답 보안**: 모든 사용자 API에서 비밀번호 해시 제거, 응답 로그 민감정보 제거/길이 제한
- **관리자 전용 API**: 사용자 생성/수정/삭제, 시스템설정 변경은 관리자(대표이사/총괄이사/개발자)만 가능
- **개발모드 로그아웃**: crm_logged_out 쿠키로 자동 로그인 방지

## 기술 스택
- **프론트엔드**: React, TypeScript, Tailwind CSS, Shadcn UI
- **백엔드**: Express.js, Node.js
- **데이터베이스**: PostgreSQL (Drizzle ORM)
- **상태 관리**: TanStack Query

## 프로젝트 구조
```
client/src/
├── components/
│   ├── app-sidebar.tsx    # 사이드바 네비게이션
│   └── theme-toggle.tsx   # 다크모드 토글
├── pages/
│   ├── dashboard.tsx      # 대시보드
│   ├── customers.tsx      # 고객 관리
│   ├── deals.tsx          # 거래 관리
│   └── activities.tsx     # 활동 내역
└── App.tsx                # 라우팅 및 레이아웃

server/
├── db.ts                  # 데이터베이스 연결
├── storage.ts             # 스토리지 레이어 (CRUD)
├── routes.ts              # API 엔드포인트
└── seed.ts                # 시드 데이터

shared/
└── schema.ts              # 데이터베이스 스키마
```

## API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/logout | 로그아웃 |
| GET | /api/auth/me | 현재 로그인 사용자 정보 |
| GET | /api/stats | 대시보드 통계 |
| GET | /api/customers | 고객 목록 |
| POST | /api/customers | 고객 추가 |
| PUT | /api/customers/:id | 고객 수정 |
| DELETE | /api/customers/:id | 고객 삭제 |
| GET | /api/deals | 거래 목록 |
| POST | /api/deals | 거래 추가 |
| PUT | /api/deals/:id | 거래 수정 |
| DELETE | /api/deals/:id | 거래 삭제 |
| GET | /api/activities | 활동 목록 |
| POST | /api/activities | 활동 추가 |
| DELETE | /api/activities/:id | 활동 삭제 |
| GET | /api/contracts | 계약 목록 |
| POST | /api/contracts | 계약 추가 |
| PUT | /api/contracts/:id | 계약 수정 |
| DELETE | /api/contracts/:id | 계약 삭제 |
| GET | /api/refunds/:contractId | 계약별 환불 내역 |
| POST | /api/refunds | 환불 등록 (계약 금액 자동 차감) |
| GET | /api/products | 상품 목록 |
| POST | /api/products | 상품 추가 |
| PUT | /api/products/:id | 상품 수정 |
| DELETE | /api/products/:id | 상품 삭제 |
| GET | /api/payments | 수납 목록 |
| POST | /api/payments | 수납 추가 |
| PUT | /api/payments/:id | 수납 수정 |
| DELETE | /api/payments/:id | 수납 삭제 |
| GET | /api/permissions | 전체 권한 목록 |
| GET | /api/permissions/:userId | 사용자별 권한 |
| PUT | /api/permissions/:userId | 사용자 권한 설정 |
| GET | /api/admin/schema | DB 스키마 조회 (개발자 전용) |
| GET | /api/admin/tables/:table/rows | 테이블 데이터 조회 (개발자 전용) |
| PUT | /api/admin/tables/:table/rows/:id | 데이터 수정 (개발자 전용) |
| DELETE | /api/admin/tables/:table/rows/:id | 데이터 삭제 (개발자 전용) |
| POST | /api/admin/sql | SQL 쿼리 실행 (개발자 전용) |

## 데이터 모델
- **customers**: 고객 정보 (이름, 이메일, 전화, 회사, 상태)
- **deals**: 거래 정보 (제목, 고객, 금액, 단계, 확률)
- **activities**: 활동 기록 (유형, 설명, 관련 고객/거래)
- **contacts**: 담당자 정보 (고객별)
- **contracts**: 계약 정보 (계약번호, 일자, 담당자, 고객, 상품, 비용)
- **products**: 상품 정보 (이름, 카테고리, 단가, 부가세)
- **payments**: 수납 정보 (입금일, 고객, 금액, 확인여부)
- **system_logs**: 시스템 로그 (사용자, 액션, IP)
- **page_permissions**: 페이지 접근 권한 (사용자ID, 페이지키)

## 실행 방법
```bash
npm run dev
```

## 데이터베이스 명령어
```bash
npm run db:push    # 스키마 적용
```
