/**
 * COS STS 临时密钥接口
 * 为前端提供安全的临时访问凭证
 */

import { NextResponse } from 'next/server';
import * as STS from 'qcloud-cos-sts';
import { isFeishuStorageMode } from '@/config/runtime-mode';

const config = {
  secretId: process.env.COS_SECRET_ID!,
  secretKey: process.env.COS_SECRET_KEY!,
  bucket: process.env.COS_BUCKET!,
  region: process.env.COS_REGION!,
  // 临时密钥有效时长，单位秒，默认 1800 秒
  durationSeconds: 1800,
  // 允许的操作
  allowActions: [
    // 简单上传
    'name/cos:PutObject',
    'name/cos:PostObject',
    // 分片上传
    'name/cos:InitiateMultipartUpload',
    'name/cos:ListMultipartUploads',
    'name/cos:ListParts',
    'name/cos:UploadPart',
    'name/cos:CompleteMultipartUpload',
    'name/cos:AbortMultipartUpload',
    // 读取（用于校验）
    'name/cos:HeadObject',
    'name/cos:GetObject',
  ],
};

export async function GET() {
  try {
    if (isFeishuStorageMode()) {
      return NextResponse.json(
        { error: 'Feishu storage mode does not use COS STS. Adapter implementation is pending.' },
        { status: 501 }
      );
    }

    const userId = 'local-user';

    // 配置检查
    if (!config.secretId || !config.secretKey || !config.bucket || !config.region) {
      return NextResponse.json(
        { error: 'COS configuration missing' },
        { status: 500 }
      );
    }

    const userPrefix = `zeocanvas/${userId}`;

    const policy = {
      version: '2.0',
      statement: [
        {
          action: config.allowActions,
          effect: 'allow',
          resource: [
            // 仅允许当前用户目录
            `qcs::cos:${config.region}:uid/1354453097:${config.bucket}/${userPrefix}/*`,
          ],
        },
      ],
    };

    const credential = await new Promise<STS.CredentialData>((resolve, reject) => {
      STS.getCredential(
        {
          secretId: config.secretId,
          secretKey: config.secretKey,
          durationSeconds: config.durationSeconds,
          policy,
        },
        (err, credential) => {
          if (err) {
            reject(err);
          } else {
            resolve(credential);
          }
        }
      );
    });

    return NextResponse.json({
      TmpSecretId: credential.credentials.tmpSecretId,
      TmpSecretKey: credential.credentials.tmpSecretKey,
      SecurityToken: credential.credentials.sessionToken,
      StartTime: credential.startTime,
      ExpiredTime: credential.expiredTime,
      Bucket: config.bucket,
      Region: config.region,
      Prefix: userPrefix,
    });
  } catch (error) {
    console.error('[COS STS] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get STS credential' },
      { status: 500 }
    );
  }
}
