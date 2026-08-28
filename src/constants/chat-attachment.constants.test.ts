import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidChatAttachmentKey } from './chat-attachment.constants';

const VALID_KEY =
  'chat-attachments/11111111-1111-4111-8111-111111111111_photo.jpg';

describe('isValidChatAttachmentKey', () => {
  it('유효한 chat-attachments key를 허용한다', () => {
    assert.equal(isValidChatAttachmentKey(VALID_KEY), true);
  });

  it('prefix가 다르면 거부한다', () => {
    assert.equal(isValidChatAttachmentKey('posts/uuid_file.jpg'), false);
  });

  it('uuid 형식이 아니면 거부한다', () => {
    assert.equal(
      isValidChatAttachmentKey('chat-attachments/not-uuid_photo.jpg'),
      false
    );
  });

  it('경로 traversal 문자를 거부한다', () => {
    assert.equal(
      isValidChatAttachmentKey(
        'chat-attachments/11111111-1111-4111-8111-111111111111/../evil.jpg'
      ),
      false
    );
  });
});
