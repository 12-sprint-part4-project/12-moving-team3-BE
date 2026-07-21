//예시 코드(이후 삭제)
import { getMessage } from "../repositories/testRepository";
import { AppError } from "../utils/AppError";

export const getTest = () => {
  const message = getMessage();

  if (message === "Hello") {
    throw new AppError("PROFILE_NOT_FOUND");
  }

  return message;
};
