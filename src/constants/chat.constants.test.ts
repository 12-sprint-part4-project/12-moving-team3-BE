import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMessagingAllowedByEstimateStatus,
  isMessagingAllowedForChatRoom,
  resolveChatCounterpartDisplayName,
  resolveChatRoomQuoteBind,
} from './chat.constants';

describe('resolveChatCounterpartDisplayName', () => {
  it('COMMUNITY는 nickname을 우선한다', () => {
    assert.equal(
      resolveChatCounterpartDisplayName('COMMUNITY', {
        name: '홍길동',
        nickname: '길동',
      }),
      '길동'
    );
  });

  it('COMMUNITY nickname 없으면 name을 사용한다', () => {
    assert.equal(
      resolveChatCounterpartDisplayName('COMMUNITY', {
        name: '홍길동',
        nickname: null,
      }),
      '홍길동'
    );
  });

  it('GENERAL은 name을 사용한다', () => {
    assert.equal(
      resolveChatCounterpartDisplayName('GENERAL', {
        name: '김기사',
        nickname: '기사님',
      }),
      '김기사'
    );
  });

  it('name·nickname 모두 없으면 상대방', () => {
    assert.equal(
      resolveChatCounterpartDisplayName('GENERAL', {
        name: null,
        nickname: null,
      }),
      '상대방'
    );
  });
});

describe('isMessagingAllowedByEstimateStatus', () => {
  it('status 없으면 허용한다', () => {
    assert.equal(isMessagingAllowedByEstimateStatus(null), true);
    assert.equal(isMessagingAllowedByEstimateStatus(undefined), true);
  });

  it('EXPIRED·CANCELED·COMPLETED면 차단한다', () => {
    assert.equal(isMessagingAllowedByEstimateStatus('EXPIRED'), false);
    assert.equal(isMessagingAllowedByEstimateStatus('CANCELED'), false);
    assert.equal(isMessagingAllowedByEstimateStatus('COMPLETED'), false);
  });

  it('SUBMITTED면 허용한다', () => {
    assert.equal(isMessagingAllowedByEstimateStatus('SUBMITTED'), true);
  });
});

describe('isMessagingAllowedForChatRoom', () => {
  it('견적 REJECTED면 차단한다', () => {
    assert.equal(
      isMessagingAllowedForChatRoom({
        estimateRequestStatus: 'SUBMITTED',
        quoteStatus: 'REJECTED',
      }),
      false
    );
  });

  it('estimate 없고 quote 없으면 허용한다', () => {
    assert.equal(isMessagingAllowedForChatRoom({}), true);
  });
});

describe('resolveChatRoomQuoteBind', () => {
  it('currentQuoteId null이면 bind', () => {
    assert.equal(resolveChatRoomQuoteBind(null, 10), 'bind');
  });

  it('동일 quoteId면 already', () => {
    assert.equal(resolveChatRoomQuoteBind(10, 10), 'already');
  });

  it('다른 quoteId면 conflict', () => {
    assert.equal(resolveChatRoomQuoteBind(10, 20), 'conflict');
  });
});
