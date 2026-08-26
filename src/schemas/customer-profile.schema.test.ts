import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { customerProfileBodySchema } from './customer-profile.schema';

const validBody = {
  phoneNumber: '01012345678',
  region: 'SEOUL',
  service: ['SMALL'],
};

describe('customerProfileBodySchema', () => {
  it('필수 전화번호를 포함한 body를 파싱한다', () => {
    const result = customerProfileBodySchema.parse(validBody);

    assert.equal(result.phoneNumber, '01012345678');
    assert.equal(result.region, 'SEOUL');
    assert.deepEqual(result.service, ['SMALL']);
  });

  it('이름과 닉네임을 trim한다', () => {
    const result = customerProfileBodySchema.parse({
      ...validBody,
      name: '  홍길동  ',
      nickname: '  길동  ',
    });

    assert.equal(result.name, '홍길동');
    assert.equal(result.nickname, '길동');
  });

  it('010으로 시작하지 않는 전화번호는 실패한다', () => {
    const result = customerProfileBodySchema.safeParse({
      ...validBody,
      phoneNumber: '01112345678',
    });

    assert.equal(result.success, false);
  });

  it('s3Key 생략·null은 허용하고 빈 문자열은 거부한다', () => {
    assert.equal(customerProfileBodySchema.safeParse(validBody).success, true);
    assert.equal(
      customerProfileBodySchema.safeParse({ ...validBody, s3Key: null }).success,
      true
    );
    assert.equal(
      customerProfileBodySchema.safeParse({ ...validBody, s3Key: '' }).success,
      false
    );
  });

  it('비밀번호 필드는 선택이다', () => {
    const result = customerProfileBodySchema.parse({
      ...validBody,
      currentPassword: 'OldPass1!',
      newPassword: 'ValidPass1!',
      newPasswordConfirm: 'ValidPass1!',
    });

    assert.equal(result.currentPassword, 'OldPass1!');
    assert.equal(result.newPassword, 'ValidPass1!');
  });
});
