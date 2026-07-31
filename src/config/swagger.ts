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
        SignupRequest: {
          type: 'object',
          required: [
            'userType',
            'name',
            'nickname',
            'email',
            'phoneNumber',
            'password',
            'passwordConfirmation',
          ],
          properties: {
            userType: {
              type: 'string',
              enum: ['CUSTOMER', 'MOVER'],
              example: 'CUSTOMER',
            },
            name: { type: 'string', example: '박소정' },
            nickname: { type: 'string', example: 'sojeong' },
            email: {
              type: 'string',
              format: 'email',
              example: 'customer@example.com',
            },
            phoneNumber: {
              type: 'string',
              example: '01012345678',
              description: '숫자 11자리',
            },
            password: {
              type: 'string',
              format: 'password',
              example: 'Password123!',
              description: '8~20자, 영문·숫자·특수문자 포함',
            },
            passwordConfirmation: {
              type: 'string',
              format: 'password',
              example: 'Password123!',
            },
          },
        },
        SignupResponse: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['user', 'accessToken'],
              properties: {
                user: {
                  type: 'object',
                  required: [
                    'id',
                    'userType',
                    'name',
                    'nickname',
                    'email',
                    'phoneNumber',
                    'isProfileCompleted',
                    'createdAt',
                  ],
                  properties: {
                    id: {
                      type: 'string',
                      format: 'uuid',
                      example: '550e8400-e29b-41d4-a716-446655440000',
                    },
                    userType: {
                      type: 'string',
                      enum: ['CUSTOMER', 'MOVER'],
                      example: 'CUSTOMER',
                    },
                    name: { type: 'string', example: '박소정' },
                    nickname: { type: 'string', example: 'sojeong' },
                    email: {
                      type: 'string',
                      format: 'email',
                      example: 'customer@example.com',
                    },
                    phoneNumber: {
                      type: 'string',
                      example: '01012345678',
                    },
                    isProfileCompleted: {
                      type: 'boolean',
                      example: false,
                      description:
                        'CUSTOMER: CustomerProfile.service 길이 > 0, MOVER: MoverProfile.service 길이 > 0',
                    },
                    createdAt: {
                      type: 'string',
                      format: 'date-time',
                      example: '2026-07-20T13:30:00.000Z',
                    },
                  },
                },
                accessToken: {
                  type: 'string',
                  description: 'Access Token (JWT)',
                },
              },
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['userType', 'email', 'password'],
          properties: {
            userType: {
              type: 'string',
              enum: ['CUSTOMER', 'MOVER'],
              example: 'CUSTOMER',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'customer@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              example: 'Password123!',
            },
          },
        },
        LoginResponse: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['user', 'accessToken'],
              properties: {
                user: {
                  type: 'object',
                  required: [
                    'id',
                    'userType',
                    'email',
                    'phoneNumber',
                    'isProfileCompleted',
                  ],
                  properties: {
                    id: {
                      type: 'string',
                      format: 'uuid',
                      example: '550e8400-e29b-41d4-a716-446655440000',
                    },
                    userType: {
                      type: 'string',
                      enum: ['CUSTOMER', 'MOVER'],
                      example: 'CUSTOMER',
                    },
                    email: {
                      type: 'string',
                      format: 'email',
                      example: 'customer@example.com',
                    },
                    phoneNumber: {
                      type: 'string',
                      example: '01012345678',
                    },
                    isProfileCompleted: {
                      type: 'boolean',
                      example: true,
                      description:
                        'CUSTOMER: CustomerProfile.service 길이 > 0, MOVER: MoverProfile.service 길이 > 0',
                    },
                  },
                },
                accessToken: {
                  type: 'string',
                  description: 'Access Token (JWT)',
                },
              },
            },
          },
        },
        LogoutResponse: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['message'],
              properties: {
                message: {
                  type: 'string',
                  example: '로그아웃되었습니다.',
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
          required: ['data'],
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
        AdminRefreshResponse: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['accessToken'],
              properties: {
                accessToken: {
                  type: 'string',
                  description: '재발급된 관리자 Access Token (JWT)',
                },
              },
            },
          },
        },
        AdminLogoutResponse: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['message'],
              properties: {
                message: {
                  type: 'string',
                  example: '로그아웃되었습니다.',
                },
              },
            },
          },
        },
        AdminMeResponse: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
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
  },
  // JSDoc(@swagger 주석)을 읽어올 경로 + 라우터 주석이 길어지는 것을 막기 위해 분리한 yaml 문서
  apis: ['./src/routes/**/*.ts', './src/docs/**/*.yaml'],
};

export const swaggerSpec = swaggerJSDoc(options);
