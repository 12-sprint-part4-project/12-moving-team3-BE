import express from "express";
import testRouter from "./routes/testRoute";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use("/", testRouter); //예시 코드(이후 삭제)

app.use(errorHandler);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
