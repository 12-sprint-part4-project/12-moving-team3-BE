import 'dotenv/config';

import { prisma } from '../src/lib/prisma';
import { hashAdminPassword } from '../src/utils/admin-password.util';

// 관리자 회원가입 API가 없으므로, 사전 등록용 부트스트랩 스크립트로 계정을 만든다.
const getBootstrapEnv = () => {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim();

  const missingKeys: string[] = [];

  if (!email) {
    missingKeys.push('ADMIN_BOOTSTRAP_EMAIL');
  }

  if (!password) {
    missingKeys.push('ADMIN_BOOTSTRAP_PASSWORD');
  }

  if (!name) {
    missingKeys.push('ADMIN_BOOTSTRAP_NAME');
  }

  if (missingKeys.length > 0 || !email || !password || !name) {
    throw new Error(
      `Missing required environment variable(s): ${missingKeys.join(', ')}`
    );
  }

  return {
    email,
    password,
    name,
  };
};

const main = async () => {
  const { email, password, name } = getBootstrapEnv();
  const passwordHash = await hashAdminPassword(password);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
    },
    create: {
      email,
      name,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  console.log('Admin bootstrap succeeded');
  console.log(`id: ${admin.id}`);
  console.log(`email: ${admin.email}`);
  console.log(`name: ${admin.name}`);
};

main()
  .catch((error: unknown) => {
    console.error('Admin bootstrap failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
