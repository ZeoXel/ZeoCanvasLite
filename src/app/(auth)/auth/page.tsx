"use client";

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { ArrowRight, Loader2 } from 'lucide-react';

function AuthForm() {
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoValidation, setPromoValidation] = useState<{ valid: boolean; bonusAmount?: number; message?: string } | null>(null);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'redirecting'>('idle');
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [showPromoCode, setShowPromoCode] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('lsai-theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const stopCountdown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    stopCountdown();
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopCountdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopCountdown]);

  useEffect(() => {
    if (countdown === 0 && sendStatus === 'sent') {
      setSendStatus('idle');
    }
  }, [countdown, sendStatus]);

  useEffect(() => () => stopCountdown(), [stopCountdown]);

  useEffect(() => {
    const urlPromoCode = searchParams.get('promo');
    if (urlPromoCode) {
      setPromoCode(urlPromoCode);
      setShowPromoCode(true);
      validatePromoCode(urlPromoCode);
    }
  }, [searchParams]);

  const validatePromoCode = async (codeValue: string) => {
    if (!codeValue) {
      setPromoValidation(null);
      return;
    }

    try {
      const res = await fetch(`/api/promo/validate?code=${encodeURIComponent(codeValue)}`);
      const data = await res.json();
      setPromoValidation(data);
    } catch (err) {
      console.error('验证推广码失败:', err);
      setPromoValidation(null);
    }
  };

  const sanitizedPhone = useMemo(() => phone.replace(/\D/g, ''), [phone]);

  const sendRequest = useCallback(async (phoneNumber: string) => {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return fetch('/api/auth/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber }),
      });
    }

    return new Promise<Response>((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/auth/send-sms', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            const responseInit = {
              status: xhr.status,
              statusText: xhr.statusText,
              headers: new Headers({
                'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json',
              }),
            };
            const body = xhr.responseText || '{}';
            resolve(new Response(body, responseInit));
          }
        };
        xhr.onerror = () => reject(new Error('网络错误，请稍后再试'));
        xhr.send(JSON.stringify({ phone: phoneNumber }));
      } catch (error) {
        reject(error);
      }
    });
  }, []);

  const handleSendCode = useCallback(async () => {
    if (sendStatus === 'sending' || countdown > 0) return;

    const normalizedPhone = sanitizedPhone;
    if (!normalizedPhone || normalizedPhone.length !== 11 || !/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      setError('请输入有效的手机号码');
      return;
    }

    setError('');
    setSendStatus('sending');

    try {
      const res = await sendRequest(normalizedPhone);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '发送失败');
      startCountdown();
      setSendStatus('sent');
    } catch (err) {
      stopCountdown();
      setCountdown(0);
      setError(err instanceof Error ? err.message : '网络错误，请稍后再试');
      setSendStatus('idle');
    }
  }, [sendStatus, countdown, sanitizedPhone, sendRequest, startCountdown, stopCountdown]);

  useEffect(() => {
    const button = sendButtonRef.current;
    if (!button) return;

    const handleNativeClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (sendStatus === 'sending' || countdown > 0) return;
      handleSendCode();
    };

    button.addEventListener('click', handleNativeClick, { passive: false });
    button.addEventListener('touchstart', handleNativeClick, { passive: false });

    return () => {
      button.removeEventListener('click', handleNativeClick);
      button.removeEventListener('touchstart', handleNativeClick);
    };
  }, [sendStatus, countdown, handleSendCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || !code) {
      setError('请输入手机号和验证码');
      return;
    }

    setError('');
    setSubmitStatus('submitting');

    try {
      const result = await signIn('phone', {
        phone,
        code,
        promoCode: promoCode || undefined,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error || '登录失败');
        setSubmitStatus('idle');
      } else {
        setSubmitStatus('redirecting');
        try {
          localStorage.removeItem('app_data_cache');
          localStorage.removeItem('balance_cache');
          localStorage.removeItem('api_keys_cache');
        } catch {
          // ignore
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        window.location.href = '/';
      }
    } catch (err) {
      console.error('登录错误:', err);
      setError('网络错误，请重试');
      setSubmitStatus('idle');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <svg width="100%" height="100%" className="opacity-40 dark:opacity-20">
          <defs>
            <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="currentColor" className="text-slate-300 dark:text-slate-600" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dotGrid)" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex h-12 items-center justify-center">
          <div className="relative h-12 w-[170px] overflow-hidden" suppressHydrationWarning>
            <Image
              src={theme === 'dark' ? "/logo-dark.svg" : "/logo-light.svg"}
              alt="ZeoCanvas"
              width={170}
              height={36}
              priority
              loading="eager"
              className="block"
            />
          </div>
        </div>

        <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-[height] duration-200 ${showPromoCode ? 'h-[350px]' : 'h-[300px]'}`}>
          <div className="mb-4">
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-300">短信登录 / 注册</h2>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-3">
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={11}
              autoComplete="tel"
              placeholder="手机号码"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/[^\d]/g, ''));
                if (error) setError('');
              }}
              required
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-0 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />

            <div className="flex gap-2">
              <input
                name="code"
                type="text"
                inputMode="numeric"
                placeholder="验证码"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (error) setError('');
                }}
                required
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-0 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              <button
                ref={sendButtonRef}
                type="button"
                disabled={sendStatus === 'sending' || countdown > 0}
                className="px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap text-sm"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              >
                {sendStatus === 'sending'
                  ? '发送中...'
                  : countdown > 0
                    ? `${countdown}s`
                    : sendStatus === 'sent'
                      ? '已发送'
                      : '获取验证码'}
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowPromoCode(!showPromoCode)}
                className="flex items-center justify-between w-full text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors"
              >
                <span>推广码（可选）</span>
                {showPromoCode ? (
                  <ChevronUpIcon className="h-4 w-4" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4" />
                )}
              </button>

              {showPromoCode && (
                <div className="mt-1 space-y-2">
                  <input
                    name="promoCode"
                    type="text"
                    placeholder="请输入推广码"
                    value={promoCode}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      setPromoCode(value);
                      if (value.length >= 6) {
                        validatePromoCode(value);
                      } else {
                        setPromoValidation(null);
                      }
                    }}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-0 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  {promoValidation && (
                    <div className={`text-xs ${promoValidation.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                      {promoValidation.valid ? `✅ ${promoValidation.message}` : `❌ ${promoValidation.message}`}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitStatus !== 'idle'}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium rounded-xl hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {submitStatus === 'submitting' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  登录中...
                </>
              ) : submitStatus === 'redirecting' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  登录成功，正在跳转...
                </>
              ) : (
                error ? (
                  <span className="w-full truncate text-center" title={error}>{error}</span>
                ) : (
                  <>
                    登录
                    <ArrowRight size={16} />
                  </>
                )
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">AI Creative Workspace</p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    }>
      <AuthForm />
    </Suspense>
  );
}
