import React from 'react';

interface UserAvatarProps {
  name?: string;
  size?: number;
  className?: string;
  showOnlineIndicator?: boolean;
}

// 默认使用蓝色（与图片节点框颜色一致）
const getColorFromString = (str: string): string => {
  // 统一使用蓝色 #3b82f6 (blue-500)，与图片节点框颜色一致
  return '#3b82f6';
};

// 获取用户名的首字符
const getInitial = (name?: string): string => {
  if (!name) return '?';

  // 移除空格并获取第一个字符
  const trimmed = name.trim();
  if (!trimmed) return '?';

  // 如果是中文，返回第一个字符
  // 如果是英文，返回第一个字母的大写
  const firstChar = trimmed[0];
  return /[a-zA-Z]/.test(firstChar) ? firstChar.toUpperCase() : firstChar;
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  size = 32,
  className = '',
  showOnlineIndicator = false,
}) => {
  const initial = getInitial(name);
  const bgColor = getColorFromString(name || '');

  return (
    <div className={`relative ${className}`}>
      <div
        className="rounded-full flex items-center justify-center text-white font-bold"
        style={{
          width: size,
          height: size,
          backgroundColor: bgColor,
          fontSize: size * 0.45,
        }}
      >
        {initial}
      </div>
      {showOnlineIndicator && (
        <div
          className="absolute bottom-0 right-0 bg-green-500 rounded-full border-2 border-white dark:border-slate-800"
          style={{
            width: size * 0.25,
            height: size * 0.25,
          }}
        />
      )}
    </div>
  );
};

export default UserAvatar;
