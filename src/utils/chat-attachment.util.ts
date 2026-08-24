import { createPresignedViewUrl } from '../services/s3.service';

/** 첨부 fileKey 목록을 조회용 Presigned URL로 변환한다. */
export const toAttachmentViewUrls = async (
  attachments: { fileKey: string }[]
): Promise<string[]> => {
  return Promise.all(
    attachments.map((attachment) => createPresignedViewUrl(attachment.fileKey))
  );
};
