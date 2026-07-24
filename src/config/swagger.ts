import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '무빙(Moving) API',
      version: '1.0.0',
      description: '이사 견적 매칭 서비스 API 문서',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
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
  // JSDoc(@swagger 주석)을 읽어올 경로. 현재 routes 구조에 맞춤.
  apis: ['./src/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
