import swaggerJSDoc from 'swagger-jsdoc';

// 배포 환경에서는 .env의 API_BASE_URL을 실제 공개 주소로 설정
export const SWAGGER_BASE_URL =
  process.env.API_BASE_URL || 'http://localhost:3000';

const options: swaggerJSDoc.Options = {
  failOnErrors: true, // @swagger 주석 파싱 오류 시 서버 시작을 실패시켜 문서 누락을 조기에 발견
  definition: {
    openapi: '3.0.0',
    info: {
      title: '무빙(Moving) API',
      version: '1.0.0',
      description: '이사 견적 매칭 서비스 API 문서',
    },
    servers: [
      {
        url: SWAGGER_BASE_URL,
        description:
          process.env.NODE_ENV === 'production' ? 'Production' : 'Local',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        // 일반 유저 bearerAuth와 분리 — 관리자 Access Token 전용
        adminBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '관리자 Access Token (Authorization: Bearer <token>)',
        },
      },
      schemas: {
        // AppError가 던지는 에러 응답 공통 포맷
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'PROFILE_NOT_FOUND',
                  description: 'src/constants/error.codes.ts 의 키 값',
                },
                message: {
                  type: 'string',
                  example: '등록된 프로필을 찾을 수 없습니다.',
                },
              },
            },
          },
        },
        AdminLoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'admin@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              minLength: 1,
              example: 'AdminPass1!',
            },
          },
        },
        AdminLoginResponse: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              required: ['accessToken', 'admin'],
              properties: {
                accessToken: {
                  type: 'string',
                  description: '관리자 Access Token (JWT)',
                },
                admin: {
                  type: 'object',
                  required: ['id', 'email', 'name'],
                  properties: {
                    id: { type: 'integer', example: 1 },
                    email: {
                      type: 'string',
                      format: 'email',
                      example: 'admin@example.com',
                    },
                    name: { type: 'string', example: '관리자' },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: '잘못된 요청 (유효성 검사 실패 등)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        Unauthorized: {
          description: '로그인이 필요합니다.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        Forbidden: {
          description: '접근 권한이 없습니다.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        NotFound: {
          description: '리소스를 찾을 수 없습니다.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        InternalServerError: {
          description: '서버 내부 오류',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
    // 핸들러 연결 전에도 문서화 가능하도록 paths에 초안을 둔다. 구현 시 route JSDoc으로 이관 가능.
    paths: {
      '/api/admin/auth/login': {
        post: {
          tags: ['Admin Auth'],
          summary: '관리자 로그인',
          description:
            '관리자 이메일/비밀번호로 로그인합니다. device는 Body로 받지 않고 User-Agent를 서버에서 판별합니다. Access Token은 응답 body로 반환하고, Refresh Token은 httpOnly 쿠키로 전달하는 방식을 예정합니다.',
          parameters: [
            {
              name: 'User-Agent',
              in: 'header',
              required: false,
              description:
                '기기 유형(DESKTOP/MOBILE/TABLET) 판별에 사용. 없거나 판별 불가 시 DESKTOP.',
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminLoginRequest' },
                example: {
                  email: 'admin@example.com',
                  password: 'AdminPass1!',
                },
              },
            },
          },
          responses: {
            '200': {
              description: '로그인 성공',
              headers: {
                'Set-Cookie': {
                  description:
                    '관리자 Refresh Token (httpOnly). 쿠키 설정 유틸은 후속 단계에서 구현.',
                  schema: { type: 'string' },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AdminLoginResponse' },
                },
              },
            },
            '400': {
              description: '요청 body 유효성 검사 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: {
                    error: {
                      code: 'ADMIN_INVALID_LOGIN_BODY',
                      message: '로그인 요청 형식이 올바르지 않습니다.',
                    },
                  },
                },
              },
            },
            '401': {
              description: '이메일 또는 비밀번호 불일치',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: {
                    error: {
                      code: 'ADMIN_INVALID_CREDENTIALS',
                      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
                    },
                  },
                },
              },
            },
            '500': {
              $ref: '#/components/responses/InternalServerError',
            },
          },
        },
      },
    },
  },
  // JSDoc(@swagger 주석)을 읽어올 경로. 현재 routes 구조에 맞춤.
  apis: ['./src/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
