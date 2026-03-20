"use client";

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        className={`relative w-full h-full bg-white dark:bg-slate-900 transition-transform duration-300 ${visible ? 'scale-100' : 'scale-[0.98]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          aria-label="关闭登录"
        >
          <X size={16} />
        </button>
        <iframe
          src="/auth"
          title="登录"
          className={`w-full h-full transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
          style={{ border: 'none' }}
        />
      </div>
    </div>
  );
};

export default LoginModal;
