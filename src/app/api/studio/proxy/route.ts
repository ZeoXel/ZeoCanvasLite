/**
 * 媒体代理 API - 解决 CORS 问题
 * 用于代理火山引擎等外部服务的媒体文件
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    try {
        // 验证 URL 是否来自可信源（与 needsProxy 保持一致）
        const allowedHosts = [
            'tos-cn-beijing.volces.com',   // 火山引擎 TOS（所有子域）
            'volccdn.com',                  // 火山引擎 CDN
            'bytecdn.cn',                   // 字节 CDN
            'volces.com',                   // 火山引擎通用
            'prod-ss-vidu',                 // Vidu S3
            'amazonaws.com.cn',             // AWS China S3
            'aliyuncs.com',                 // 阿里云 OSS（Seedream 等）
            'cos.lsaigc.com',               // 腾讯云 COS（兼容旧存储格式）
            'myqcloud.com',                 // 腾讯云 COS 原始域名
        ];

        const urlObj = new URL(url);
        if (!allowedHosts.some(host => urlObj.hostname.includes(host))) {
            console.error('[Proxy API] Blocked URL:', urlObj.hostname);
            return NextResponse.json({ error: '不允许的 URL 来源' }, { status: 403 });
        }

        const response = await fetch(url);

        if (!response.ok) {
            return NextResponse.json(
                { error: `代理请求失败: ${response.status}` },
                { status: response.status }
            );
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        // 流式转发，避免将大文件（视频等）全部缓冲进 VPS 内存后才返回
        return new NextResponse(response.body, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (error: any) {
        console.error('[Proxy API] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Proxy error' },
            { status: 500 }
        );
    }
}
