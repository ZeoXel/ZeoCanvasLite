import { NextRequest, NextResponse } from 'next/server'
import { VerificationService } from '@/lib/services/verification.service'
import * as tencentcloud from 'tencentcloud-sdk-nodejs'

const SmsClient = tencentcloud.sms.v20210111.Client

// 生成6位随机验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const { phone, name } = await request.json()
    
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: '请输入有效的手机号码' },
        { status: 400 }
      )
    }

    // 生成验证码
    const code = generateCode()
    
    // 开发环境：在控制台打印验证码
    if (process.env.NODE_ENV === 'development') {
      console.log('\n=================================')
      console.log(`🔐 验证码发送成功`)
      console.log(`📱 手机号: ${phone}`)
      console.log(`🔢 验证码: ${code}`)
      console.log(`⏰ 有效期: 5分钟`)
      console.log('=================================\n')
    }

    // 生产环境：调用腾讯云SMS API（如果启用了ENABLE_SMS）
    if (process.env.ENABLE_SMS === 'true') {
      // 检查必需的环境变量
      const requiredEnvVars = {
        TENCENT_SECRET_ID: process.env.TENCENT_SECRET_ID,
        TENCENT_SECRET_KEY: process.env.TENCENT_SECRET_KEY,
        TENCENT_SMS_SDK_APP_ID: process.env.TENCENT_SMS_SDK_APP_ID,
        TENCENT_SMS_TEMPLATE_ID: process.env.TENCENT_SMS_TEMPLATE_ID,
        TENCENT_SMS_SIGN_NAME: process.env.TENCENT_SMS_SIGN_NAME,
      }
      
      // 检查是否有未定义的环境变量
      const missingVars = Object.entries(requiredEnvVars)
        .filter(([key, value]) => !value)
        .map(([key]) => key)
      
      if (missingVars.length > 0) {
        return NextResponse.json(
          { error: 'SMS配置错误，请联系管理员' },
          { status: 500 }
        )
      }

      const clientConfig = {
        credential: {
          secretId: requiredEnvVars.TENCENT_SECRET_ID!,
          secretKey: requiredEnvVars.TENCENT_SECRET_KEY!,
        },
        region: 'ap-guangzhou',
        profile: {
          httpProfile: {
            endpoint: 'sms.tencentcloudapi.com',
          },
        },
      }

      const client = new SmsClient(clientConfig)
      
      // 根据模板ID 2435212 的要求，只传递验证码参数
      const params = {
        PhoneNumberSet: [`+86${phone}`],
        SmsSdkAppId: requiredEnvVars.TENCENT_SMS_SDK_APP_ID!,
        TemplateId: requiredEnvVars.TENCENT_SMS_TEMPLATE_ID!,
        SignName: requiredEnvVars.TENCENT_SMS_SIGN_NAME!,
        TemplateParamSet: [code], // 只传递验证码
      }

      try {
        const response = await client.SendSms(params)
        
        if (response.SendStatusSet?.[0]?.Code === 'Ok') {
        } else {
          // 如果模板参数不匹配，尝试其他格式
          if (response.SendStatusSet?.[0]?.Code === 'FailedOperation.TemplateParamSetNotMatchApprovedTemplate') {
            // 尝试带有效期的格式
            params.TemplateParamSet = [code, '5']
            const retryResponse = await client.SendSms(params)
            if (retryResponse.SendStatusSet?.[0]?.Code !== 'Ok') {
              return NextResponse.json(
                { error: '短信发送失败，请稍后再试' },
                { status: 500 }
              )
            }
          } else {
            return NextResponse.json(
              { error: '短信发送失败，请稍后再试' },
              { status: 500 }
            )
          }
        }
      } catch (smsError) {
        return NextResponse.json(
          { error: '短信服务异常，请稍后再试' },
          { status: 500 }
        )
      }
    }
    
    // 保存验证码到数据库（5分钟有效）
    await VerificationService.storeVerificationCode(phone, code, name)
    
    return NextResponse.json({ 
      success: true,
      message: process.env.NODE_ENV === 'development' && !process.env.ENABLE_SMS 
        ? '验证码已打印到控制台' 
        : '验证码已发送'
    })
    
  } catch (error) {
    console.error('❌ 发送验证码失败:', error)
    return NextResponse.json(
      { error: '服务器错误，请稍后再试' },
      { status: 500 }
    )
  }
}