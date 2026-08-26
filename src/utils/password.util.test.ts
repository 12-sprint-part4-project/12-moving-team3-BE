import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from './app.error';
import type { ErrorCode } from '../constants/error.codes';
import {
  hashAuthPassword,
  resolvePasswordHashForUpdate,
} from './password.util';

const assertAppError =
  (code: ErrorCode) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  };

describe('resolvePasswordHashForUpdate', () => {
  it('newPassword가 없으면 undefined를 반환한다', async () => {
    const result = await resolvePasswordHashForUpdate({
      findLocalPasswordHash: async () => {
        throw new Error('should not query password');
      },
    });

    assert.equal(result, undefined);
  });

  it('현재 비밀번호가 없으면 CURRENT_PASSWORD_REQUIRED를 던진다', async () => {
    await assert.rejects(
      () =>
        resolvePasswordHashForUpdate({
          newPassword: 'ValidPass1!',
          findLocalPasswordHash: async () => ({ passwordHash: 'hash' }),
        }),
      assertAppError('CURRENT_PASSWORD_REQUIRED')
    );
  });

  it('새 비밀번호 확인이 없으면 NEW_PASSWORD_CONFIRM_REQUIRED를 던진다', async () => {
    await assert.rejects(
      () =>
        resolvePasswordHashForUpdate({
          currentPassword: 'OldPass1!',
          newPassword: 'ValidPass1!',
          findLocalPasswordHash: async () => ({ passwordHash: 'hash' }),
        }),
      assertAppError('NEW_PASSWORD_CONFIRM_REQUIRED')
    );
  });

  it('새 비밀번호 형식이 아니면 INVALID_NEW_PASSWORD를 던진다', async () => {
    await assert.rejects(
      () =>
        resolvePasswordHashForUpdate({
          currentPassword: 'OldPass1!',
          newPassword: 'short',
          newPasswordConfirm: 'short',
          findLocalPasswordHash: async () => ({ passwordHash: 'hash' }),
        }),
      assertAppError('INVALID_NEW_PASSWORD')
    );
  });

  it('새 비밀번호 확인이 다르면 NEW_PASSWORD_MISMATCH를 던진다', async () => {
    await assert.rejects(
      () =>
        resolvePasswordHashForUpdate({
          currentPassword: 'OldPass1!',
          newPassword: 'ValidPass1!',
          newPasswordConfirm: 'ValidPass2!',
          findLocalPasswordHash: async () => ({ passwordHash: 'hash' }),
        }),
      assertAppError('NEW_PASSWORD_MISMATCH')
    );
  });

  it('현재 비밀번호와 같으면 SAME_AS_CURRENT_PASSWORD를 던진다', async () => {
    await assert.rejects(
      () =>
        resolvePasswordHashForUpdate({
          currentPassword: 'ValidPass1!',
          newPassword: 'ValidPass1!',
          newPasswordConfirm: 'ValidPass1!',
          findLocalPasswordHash: async () => ({ passwordHash: 'hash' }),
        }),
      assertAppError('SAME_AS_CURRENT_PASSWORD')
    );
  });

  it('로컬 비밀번호가 없거나 현재 비밀번호가 틀리면 CURRENT_PASSWORD_MISMATCH를 던진다', async () => {
    await assert.rejects(
      () =>
        resolvePasswordHashForUpdate({
          currentPassword: 'OldPass1!',
          newPassword: 'ValidPass1!',
          newPasswordConfirm: 'ValidPass1!',
          findLocalPasswordHash: async () => null,
        }),
      assertAppError('CURRENT_PASSWORD_MISMATCH')
    );
  });

  it('현재 비밀번호가 맞으면 새 비밀번호 해시를 반환한다', async () => {
    const currentHash = await hashAuthPassword('OldPass1!');

    const nextHash = await resolvePasswordHashForUpdate({
      currentPassword: 'OldPass1!',
      newPassword: 'ValidPass1!',
      newPasswordConfirm: 'ValidPass1!',
      findLocalPasswordHash: async () => ({ passwordHash: currentHash }),
    });

    assert.equal(typeof nextHash, 'string');
    assert.notEqual(nextHash, currentHash);
  });
});
