"use client";

import React, { useState, useEffect, useRef } from 'react';
import { X, User, CreditCard, Mail, Phone, Key, RefreshCw, Activity, Copy, Check, Edit2, BarChart3, Eye, EyeOff } from 'lucide-react';
import { fetchAssignedApiKey } from '@/services/userKeyService';
import { useUserData } from '@/contexts/UserDataContext';
import { VTrendChart } from './charts/VTrendChart';
import { RechargeModal } from '@/components/recharge';
import { VDonutChart } from './charts/VDonutChart';
import { VBarChart } from './charts/VBarChart';
import { UserAvatar } from './UserAvatar';

interface UserInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'account' | 'credits';
}

type TabType = 'account' | 'credits';

export const UserInfoModal: React.FC<UserInfoModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'account'
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const { user, credits, userLoading, creditsLoading, refreshUser, refreshCredits, updateUserLocal } = useUserData();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'trend' | 'distribution' | 'calls'>('trend');
  const [fullApiKey, setFullApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // 同步defaultTab变化
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // 打开时加载数据
  useEffect(() => {
    if (isOpen) {
      refreshUser();
      refreshCredits({ scope: 'full' });
    }
  }, [isOpen, refreshCredits, refreshUser]);

  useEffect(() => {
    if (!isOpen) return;

    const loadKey = async () => {
      try {
        const cachedKey = localStorage.getItem('api_key_cache');
        if (cachedKey) {
          const { data, timestamp } = JSON.parse(cachedKey);
          if (Date.now() - timestamp < 5 * 60 * 1000 && data) {
            setFullApiKey(data as string);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to parse key cache', e);
      }

      try {
        const apiKey = await fetchAssignedApiKey();
        if (apiKey) {
          setFullApiKey(apiKey);
          localStorage.setItem('api_key_cache', JSON.stringify({ data: apiKey, timestamp: Date.now() }));
        }
      } catch (err) {
        console.error('获取API Key失败:', err);
      }
    };

    loadKey();
  }, [isOpen]);

  // 编辑用户名时聚焦输入框
  useEffect(() => {
    if (isEditingUsername && usernameInputRef.current) {
      usernameInputRef.current.focus();
      usernameInputRef.current.select();
    }
  }, [isEditingUsername]);

  useEffect(() => {
    if (!isEditingUsername) {
      setEditedUsername(user?.user.username || user?.user.name || '');
    }
  }, [isEditingUsername, user]);

  // 阻止滚轮事件传播到画布
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
    };

    const modalElement = modalRef.current;
    if (isOpen && modalElement) {
      modalElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        modalElement.removeEventListener('wheel', handleWheel);
      };
    }
  }, [isOpen]);

  const handleRefresh = () => {
    if (activeTab === 'account') {
      refreshUser({ force: true });
    } else {
      refreshCredits({ force: true, scope: 'full' });
    }
  };

  const copyToClipboard = async (text: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const handleSaveUsername = async () => {
    if (!editedUsername.trim() || !user) return;

    setSavingUsername(true);
    try {
      const response = await fetch('/api/user/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editedUsername.trim() }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '更新用户名失败');
      }

      updateUserLocal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          user: { ...prev.user, username: editedUsername.trim(), name: editedUsername.trim() },
        };
      });
      setIsEditingUsername(false);
    } catch (err) {
      console.error('保存用户名失败:', err);
      alert(err instanceof Error ? err.message : '保存用户名失败，请重试');
    } finally {
      setSavingUsername(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingUsername(false);
    setEditedUsername(user?.user.username || user?.user.name || '');
  };

  if (!isOpen) return null;

  // 模型颜色映射
  const providerColors: Record<string, { text: string; fill: string }> = {
    // 视频类
    'vidu': { text: 'text-purple-600 dark:text-purple-400', fill: '#a855f7' },
    'viduq1-pro': { text: 'text-purple-600 dark:text-purple-400', fill: '#a855f7' },
    'viduq3-pro': { text: 'text-violet-600 dark:text-violet-300', fill: '#7c3aed' },
    'viduq2-pro': { text: 'text-purple-500 dark:text-purple-300', fill: '#c084fc' },
    'viduq2-turbo': { text: 'text-violet-500 dark:text-violet-300', fill: '#8b5cf6' },
    'veo': { text: 'text-indigo-600 dark:text-indigo-400', fill: '#6366f1' },
    'veo3': { text: 'text-indigo-600 dark:text-indigo-400', fill: '#6366f1' },
    'veo3.1': { text: 'text-indigo-500 dark:text-indigo-300', fill: '#818cf8' },
    'seedance': { text: 'text-fuchsia-600 dark:text-fuchsia-400', fill: '#d946ef' },
    'seedance-1-lite': { text: 'text-fuchsia-600 dark:text-fuchsia-400', fill: '#d946ef' },
    'doubao-seedance': { text: 'text-fuchsia-500 dark:text-fuchsia-300', fill: '#e879f9' },
    // 图像类
    'nano-banana': { text: 'text-yellow-600 dark:text-yellow-400', fill: '#eab308' },
    'seedream': { text: 'text-emerald-600 dark:text-emerald-400', fill: '#10b981' },
    'seedream-3.0': { text: 'text-emerald-600 dark:text-emerald-400', fill: '#10b981' },
    'doubao-seedream': { text: 'text-teal-500 dark:text-teal-300', fill: '#14b8a6' },
    'flux-pro': { text: 'text-blue-600 dark:text-blue-400', fill: '#3b82f6' },
    // 音频类
    'suno': { text: 'text-red-600 dark:text-red-400', fill: '#ef4444' },
    'chirp-v4': { text: 'text-red-600 dark:text-red-400', fill: '#ef4444' },
    'speech-2.6-hd': { text: 'text-orange-600 dark:text-orange-400', fill: '#f97316' },
    'minimax': { text: 'text-orange-600 dark:text-orange-400', fill: '#f97316' },
    // 默认
    'default': { text: 'text-slate-600 dark:text-slate-400', fill: '#64748b' },
  };

  // 预定义的颜色列表，用于未匹配的模型
  const fallbackColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  const getProviderColor = (provider: string, index?: number) => {
    // 尝试精确匹配
    if (providerColors[provider]) return providerColors[provider];
    // 尝试前缀匹配
    for (const key of Object.keys(providerColors)) {
      if (provider.toLowerCase().includes(key.toLowerCase())) {
        return providerColors[key];
      }
    }
    // 基于索引或字符串哈希生成不同颜色
    const colorIndex = index !== undefined
      ? index % fallbackColors.length
      : Math.abs(provider.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % fallbackColors.length;
    return { text: 'text-slate-600 dark:text-slate-400', fill: fallbackColors[colorIndex] };
  };

  const getProviderName = (provider: string) => {
    const names: Record<string, string> = {
      // 视频
      'vidu': 'Vidu',
      'viduq1-pro': 'Vidu Q1 Pro',
      'viduq3-pro': 'Vidu Q3 Pro',
      'viduq2-pro': 'Vidu Q2 Pro',
      'viduq2-turbo': 'Vidu Q2 Turbo',
      'veo': 'Veo',
      'veo3': 'Veo 3',
      'veo3.1': 'Veo 3.1',
      // 图像
      'nano-banana': 'Nano Banana',
      'seedream': 'Seedream',
      'seedream-3.0': 'Seedream 3.0',
      'flux-pro': 'Flux Pro',
      // 音频
      'suno': 'Suno',
      'chirp-v4': 'Suno Chirp V4',
      'speech-2.6-hd': 'MiniMax TTS',
      'minimax': 'MiniMax',
    };
    // 精确匹配
    if (names[provider]) return names[provider];
    // 前缀匹配
    for (const [key, name] of Object.entries(names)) {
      if (provider.toLowerCase().includes(key.toLowerCase())) {
        return name;
      }
    }
    // 返回原始名称（首字母大写）
    return provider.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  };

  // 服务类型名称（用于交易记录显示）
  const getServiceName = (service: string) => {
    switch (service) {
      case 'video': return '视频生成';
      case 'image': return '图片生成';
      case 'audio': return '音频生成';
      case 'chat': return 'AI对话';
      default: return service;
    }
  };

  // 准备趋势图数据（7天）
  const trendData = credits?.usage.last7Days.daily?.map(d => ({
    date: d.date,
    value: d.consumption
  })) || [];

  // 准备环形图数据（按模型分类）
  const donutData = credits?.usage.last30Days.byProvider?.map((item, index) => ({
    label: getProviderName(item.provider),
    value: item.consumption,
    color: getProviderColor(item.provider, index).fill
  })) || [];

  return (
    <div
      className="fixed inset-0 z-[100] bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-[1152px] h-[648px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 - 带Tab切换 */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={onClose}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              用户中心
            </span>
            <button
              onClick={handleRefresh}
              disabled={userLoading || creditsLoading}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                size={18}
                className={(userLoading || creditsLoading) ? 'animate-spin' : ''}
              />
            </button>
          </div>

          {/* Tab切换 */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('account')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'account'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <User size={16} />
              <span>账户管理</span>
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'credits'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <CreditCard size={16} />
              <span>积分明细</span>
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 p-6 overflow-hidden">
          {activeTab === 'account' ? (
            /* 账户管理内容 */
            <div className="grid grid-cols-3 gap-6 h-full">
              {/* 左侧：用户信息 */}
              <div className="col-span-1 space-y-6">
                <div className="flex flex-col items-center text-center">
                  {userLoading && !user ? (
                    <div className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse mb-4" />
                  ) : (
                    <UserAvatar
                      name={user?.user.username || user?.user.name}
                      size={96}
                      className="mb-4"
                    />
                  )}

                  {userLoading && !user ? (
                    <>
                      <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-2 animate-pulse" />
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 animate-pulse" />
                    </>
                  ) : (
                    <>
                      {/* 用户名 - 内联编辑 */}
                      <div className="flex items-center gap-2 mb-2">
                        {isEditingUsername ? (
                          <>
                            <input
                              ref={usernameInputRef}
                              type="text"
                              value={editedUsername}
                              onChange={(e) => setEditedUsername(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveUsername();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              onBlur={handleCancelEdit}
                              disabled={savingUsername}
                              className="text-xl font-bold text-center bg-white dark:bg-slate-800 border-b-2 border-blue-500 dark:border-blue-400 text-slate-900 dark:text-slate-100 focus:outline-none px-2 py-0.5 min-w-[120px]"
                            />
                          </>
                        ) : (
                          <>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                              {user?.user.username || user?.user.name || '未设置'}
                            </h3>
                            <button
                              onClick={() => setIsEditingUsername(true)}
                              className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="编辑用户名"
                            >
                              <Edit2 size={14} />
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          user?.user.status === 'active'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        }`}>
                          {user?.user.status === 'active' ? '正常' : '禁用'}
                        </span>
                        {user?.user.role === 'admin' && (
                          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            管理员
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 联系信息 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <Mail size={18} className="text-slate-500 dark:text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">邮箱</div>
                      {userLoading && !user ? (
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full animate-pulse" />
                      ) : (
                        <div className="text-sm text-slate-900 dark:text-slate-100 truncate">
                          {user?.user.email || '未设置'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <Phone size={18} className="text-slate-500 dark:text-slate-400" />
                    <div className="flex-1">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">手机号</div>
                      {userLoading && !user ? (
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full animate-pulse" />
                      ) : (
                        <div className="text-sm text-slate-900 dark:text-slate-100">
                          {user?.user.phone || '未设置'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 账户余额与充值入口 */}
                <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      账户余额
                    </div>
                    <button
                      onClick={() => setShowRechargeModal(true)}
                      className="px-3 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-full transition-all"
                    >
                      充值
                    </button>
                  </div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                    {credits?.balance?.remaining?.toFixed(2) || '0.00'}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">积分</span>
                  </div>
                  {creditsLoading && !credits?.usage ? (
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24 animate-pulse" />
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      近30天消费: {credits?.usage.last30Days.consumption.toFixed(0) || 0} 积分
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：API Keys + 最近交易 */}
              <div className="col-span-2 flex flex-col gap-4 h-full overflow-hidden">
                {/* API Keys - 显示完整密钥 */}
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Key size={14} className="text-slate-500 dark:text-slate-400" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        API Key
                      </span>
                    </div>
                  </div>

                  {userLoading && !fullApiKey ? (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg animate-pulse">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                    </div>
                  ) : fullApiKey ? (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                            {showApiKey ? fullApiKey : `${fullApiKey.slice(0, 8)}${'•'.repeat(32)}${fullApiKey.slice(-4)}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title={showApiKey ? '隐藏' : '显示'}
                          >
                            {showApiKey ? (
                              <EyeOff size={14} className="text-slate-500 dark:text-slate-400" />
                            ) : (
                              <Eye size={14} className="text-slate-500 dark:text-slate-400" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(fullApiKey, 'apikey')}
                            className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title="复制"
                          >
                            {copiedKey === 'apikey' ? (
                              <Check size={14} className="text-green-600 dark:text-green-400" />
                            ) : (
                              <Copy size={14} className="text-slate-500 dark:text-slate-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center text-xs text-slate-500 dark:text-slate-400">
                      暂无 API Key
                    </div>
                  )}
                </div>

                {/* 最近交易 - 上下排布，自定义滚动条 */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      最近交易
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {credits?.recentTransactions?.length || 0} 条记录
                    </span>
                  </div>

                  {credits?.recentTransactions && credits.recentTransactions.length > 0 ? (
                    <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
                      {credits.recentTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {getServiceName(tx.service)}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {new Date(tx.createdAt).toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {tx.model}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <span className="text-base font-bold text-red-600 dark:text-red-400">
                              -{tx.amount}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                      暂无交易记录
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* 积分明细内容 - 优化布局铺满 */
            <div className="h-full flex flex-col gap-4 overflow-hidden">
              {/* 积分概览 - 水平排列 */}
              <div className="grid grid-cols-3 gap-4 flex-shrink-0">
                {creditsLoading && !credits ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg animate-pulse">
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-12 mb-2" />
                        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">总积分</div>
                      <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                        {credits?.balance.total.toLocaleString() || 0}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">已使用</div>
                      <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {credits?.balance.used.toLocaleString() || 0}
                      </div>
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">剩余</div>
                      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {credits?.balance.remaining.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 主要内容区 - 使用 flex-1 填充剩余空间 */}
              <div className="flex-1 grid grid-cols-3 gap-4 min-h-0 overflow-hidden">
                {/* 左侧：数据分析图表 + 快速统计 */}
                <div className="col-span-2 flex flex-col gap-4 min-h-0">
                  {/* 数据分析图表 - 带切换 */}
                  <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-lg p-4 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <BarChart3 size={16} className="text-slate-500 dark:text-slate-400" />
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                          数据分析
                        </span>
                      </div>
                      <div className="flex gap-1 bg-slate-200 dark:bg-slate-700 rounded-lg p-0.5">
                        <button
                          onClick={() => setActiveChartTab('trend')}
                          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                            activeChartTab === 'trend'
                              ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          消耗趋势
                        </button>
                        <button
                          onClick={() => setActiveChartTab('distribution')}
                          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                            activeChartTab === 'distribution'
                              ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          消耗分布
                        </button>
                        <button
                          onClick={() => setActiveChartTab('calls')}
                          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                            activeChartTab === 'calls'
                              ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          调用次数
                        </button>
                      </div>
                    </div>
                    {creditsLoading && !credits ? (
                      <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                    ) : (
                      <div className="flex-1 min-h-0">
                        {activeChartTab === 'trend' && (
                          trendData.length > 0 ? (
                            <VTrendChart data={trendData} color="#3b82f6" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                              暂无数据
                            </div>
                          )
                        )}
                        {activeChartTab === 'distribution' && (
                          <VBarChart
                            data={donutData.map(d => ({ model: d.label, value: d.value, color: d.color }))}
                            valueLabel="积分"
                          />
                        )}
                        {activeChartTab === 'calls' && (
                          <VBarChart
                            data={credits?.usage.last30Days.byProvider.map((item, index) => ({
                              model: getProviderName(item.provider),
                              value: item.transactions,
                              color: getProviderColor(item.provider, index).fill,
                            })) || []}
                            valueLabel="次"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* 快速统计 - 固定高度 */}
                  <div className="grid grid-cols-3 gap-4 flex-shrink-0">
                    {creditsLoading && !credits ? (
                      <>
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg animate-pulse">
                            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16 mb-2" />
                            <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-12" />
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">今日</div>
                          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {credits?.usage.today.consumption.toFixed(1) || 0}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {credits?.usage.today.transactions || 0} 次
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">7天</div>
                          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {credits?.usage.last7Days.consumption.toFixed(1) || 0}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {credits?.usage.last7Days.transactions || 0} 次
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">30天</div>
                          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {credits?.usage.last30Days.consumption.toFixed(1) || 0}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {credits?.usage.last30Days.transactions || 0} 次
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 右侧：模型占比环形图 - 与左侧底部对齐 */}
                <div className="col-span-1 bg-slate-50 dark:bg-slate-800 rounded-lg p-4 flex flex-col min-h-0">
                  <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                    <Activity size={16} className="text-slate-500 dark:text-slate-400" />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      模型占比
                    </span>
                  </div>
                  {creditsLoading && !credits ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="w-40 h-40 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                    </div>
                  ) : donutData.length > 0 ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <div className="flex-1 min-h-0">
                        <VDonutChart data={donutData} />
                      </div>
                      <div className="mt-2 flex-shrink-0 max-h-24 overflow-y-auto custom-scrollbar">
                        {credits?.usage.last30Days.byProvider.map((item, index) => (
                          <div
                            key={`${item.provider}-${index}`}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-default"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: getProviderColor(item.provider, index).fill }}
                              />
                              <span className="text-slate-600 dark:text-slate-300 truncate">
                                {getProviderName(item.provider)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-slate-500 dark:text-slate-400">
                                {item.consumption.toFixed(1)}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-slate-100 w-8 text-right">
                                {item.percentage}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                      暂无数据
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 自定义滚动条样式 */}
      <style jsx global>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }

        .custom-scrollbar:hover {
          scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: transparent;
          border-radius: 3px;
        }

        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.3);
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(148, 163, 184, 0.5);
        }
      `}</style>

      {/* 充值弹窗 */}
      <RechargeModal
        isOpen={showRechargeModal}
        onClose={() => setShowRechargeModal(false)}
        onSuccess={(orderNo, amount) => {
          console.log('充值成功:', orderNo, amount)
          refreshCredits({ force: true, scope: 'full' })
        }}
      />
    </div>
  );
};

export default UserInfoModal;
