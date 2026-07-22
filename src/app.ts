import express from 'express';
import helmet from 'helmet';
import testRouter from './routes/test.route';
import { errorHandler } from './middlewares/error.handler';

const app = express();

app.use(helmet());
app.use(express.json());

app.use('/', testRouter); //예시 코드(이후 삭제)

app.use(errorHandler);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
