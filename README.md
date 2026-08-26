# 무빙 (Moving) Backend

이사 견적 매칭 서비스 API 서버입니다.

고객·기사 API와 관리자 API를 함께 제공합니다.

## Team

|          [추명곤](https://github.com/hogu-giriboy)          |          [강정민](https://github.com/jeongmin00)          |          [박소정](https://github.com/sojeong0302)          |          [김나린](https://github.com/narin116)           |
| :---------------------------------------------------------: | :-------------------------------------------------------: | :--------------------------------------------------------: | :------------------------------------------------------: |
| <img src="https://github.com/hogu-giriboy.png" width="80"/> | <img src="https://github.com/jeongmin00.png" width="80"/> | <img src="https://github.com/sojeong0302.png" width="80"/> | <img src="https://github.com/narin116.png" width="80"/>  |
|              **관리자 인증**<br/>**운영 관리**              |                **채팅**<br/>**Socket.IO**                 |                  **인증/인가**<br/>**S3**                  |               **기사님 조회**<br/>**리뷰**               |
|           [최혜성](https://github.com/gptjd0204)            |            [한고은](https://github.com/NAYA3)             |           [김남진](https://github.com/knj980425)           |          [김상우](https://github.com/codribble)          |
|  <img src="https://github.com/gptjd0204.png" width="80"/>   |   <img src="https://github.com/NAYA3.png" width="80"/>    |  <img src="https://github.com/knj980425.png" width="80"/>  | <img src="https://github.com/codribble.png" width="80"/> |
|              **고객/기사님**<br/>**견적 관리**              |            **커뮤니티**<br/>**tiptap 에디터**             |            **관리자 통계**<br/>**서비스 관리**             |                **견적요청**<br/>**알림**                 |

## Tech Stack

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socketdotio&logoColor=white)
![AWS S3](https://img.shields.io/badge/AWS%20S3-569A31?style=flat-square&logo=amazons3&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![Kakao](https://img.shields.io/badge/Kakao-FFCD00?style=flat-square&logo=kakao&logoColor=black)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![Swagger](https://img.shields.io/badge/Swagger-85EA2D?style=flat-square&logo=swagger&logoColor=black)
![Sentry](https://img.shields.io/badge/Sentry-362D59?style=flat-square&logo=sentry&logoColor=white)

## Getting Started

```bash
git clone https://github.com/12-sprint-part4-project/12-moving-team3-BE.git
cd 12-moving-team3-BE
npm install
cp .env.example .env
```

`.env`에 DB, JWT, CORS 등 값을 채운 뒤:

```bash
npx prisma generate
npx prisma migrate dev
npm run dev
```

기본 포트는 `8080`입니다. (`PORT` 환경변수로 변경 가능)

환경변수 항목은 `.env.example`을 참고하세요.

Swagger: [http://localhost:8000/api-docs](http://localhost:8000/api-docs)

## Architecture

```text
Route → Controller → Service → Repository → Database
```

- **Route**: 엔드포인트, 미들웨어
- **Controller**: 요청/응답만 처리
- **Service**: 비즈니스 로직, 트랜잭션
- **Repository**: Prisma 데이터 접근만

## Folder Structure

```text
src
├── routes         # 엔드포인트
├── controllers    # 요청/응답
├── services       # 비즈니스 로직
├── repositories   # Prisma 데이터 접근
├── schemas        # Zod 검증
├── middlewares
├── sockets        # Socket.IO
├── jobs           # 크론
├── docs           # Swagger
├── config
├── constants
├── dtos
├── lib
├── utils
└── app.ts
prisma             # 스키마, 마이그레이션
scripts
```

## API

| Prefix                              | 설명                           |
| ----------------------------------- | ------------------------------ |
| `/api/auth`                         | 회원가입, 로그인, 카카오, 토큰 |
| `/api/users/customers`              | 고객 프로필                    |
| `/api/users/movers`                 | 기사 프로필                    |
| `/api/movers`                       | 기사 목록                      |
| `/api/estimate-requests`            | 견적 요청                      |
| `/api/designated-estimate-requests` | 지정 견적                      |
| `/api/review`                       | 리뷰                           |
| `/api/favorites`                    | 찜                             |
| `/api/chat`                         | 채팅                           |
| `/api/notifications`                | 알림                           |
| `/api/posts`                        | 커뮤니티                       |
| `/api/reports`                      | 신고                           |
| `/api/admin/*`                      | 관리자                         |

성공:

```json
{
  "data": {},
  "meta": {}
}
```

에러:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message"
  }
}
```

## Commit Convention

`type: 커밋 메시지`

| Type       | 설명              |
| ---------- | ----------------- |
| `feat`     | 기능 추가 ✨      |
| `fix`      | 버그 수정 🐛      |
| `refactor` | 리팩토링 ♻️       |
| `style`    | UI/스타일 수정 🎨 |
| `docs`     | 문서 수정 📝      |
| `chore`    | 설정 변경 🔨      |
| `perf`     | 성능 개선 ⚡      |
| `remove`   | 기능 삭제 🔥      |
