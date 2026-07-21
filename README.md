# 📂 폴더 구조

```text
src
├── constants
│   └── errorCodes.ts
├── controllers
│   └── ...
├── middlewares
│   └── errorHandler.ts
├── repositories
│   └── ...
├── routes
│   └── ...
├── services
│   └── ...
├── utils
│   └── AppError.ts
└── app.ts
```

## 요청 처리 순서

```text
Client
  ↓
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Database
```

## routes

- API 주소를 정의하는 곳
- Controller와 연결만 담당

```ts
GET /customer-profiles
        ↓
customerController.getProfiles()
```

## controllers

- Request를 받고 Service를 호출
- Service 결과를 Response로 반환

> **요청과 응답만 담당**

## services

- 실제 기능이 구현되는 곳
- 입력값 검증
- 권한 검사
- Repository 호출
- 필요한 경우 AppError 발생

> **비즈니스 로직 담당**

## repositories

- Prisma를 사용하는 곳
- DB 조회 / 생성 / 수정 / 삭제

> **DB 작업만 담당**

## middlewares

공통으로 사용하는 기능

- 인증
- 에러 처리
- 권한 검사

## constants

공통 상수 관리

- Error Code
- Enum

## utils

공통으로 사용하는 클래스 및 함수

- AppError

## app.ts

- Router 등록
- Middleware 등록
- 서버 실행
