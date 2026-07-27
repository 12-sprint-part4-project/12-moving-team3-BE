import { z } from 'zod';

export const adminLoginBodySchema = z.object({
  email: z.email('올바른 이메일 형식으로 입력해 주세요.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

export type AdminLoginBody = z.infer<typeof adminLoginBodySchema>;
