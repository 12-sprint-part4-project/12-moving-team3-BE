import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { SWAGGER_BASE_URL, swaggerSpec } from './config/swagger';
import { errorHandler } from './middlewares/error.handler';
import testRouter from './routes/test.route';

const app = express();

app.use(helmet());
app.use(express.json());

// Swagger 문서 - 프로덕션 배포 시에는 노출 X
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use('/', testRouter);

app.use(errorHandler);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger docs: ${SWAGGER_BASE_URL}/api-docs`);
  }
});
