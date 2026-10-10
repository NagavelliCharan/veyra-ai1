import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'indigo' | 'emerald' | 'amber' | 'stone' | 'rose' | 'sky';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'stone',
  size = 'sm',
  icon,
  className = '',
  title,
  onClick,
}) => {
  const variantStyles = {
    indigo: 'bg-indigo-50/80 text-indigo-700 border-indigo-200/80',
    emerald: 'bg-emerald-50/80 text-emerald-800 border-emerald-200/80',
    amber: 'bg-amber-50/80 text-amber-800 border-amber-200/80',
    rose: 'bg-rose-50/80 text-rose-700 border-rose-200/80',
    stone: 'bg-stone-100 text-stone-700 border-stone-200',
    sky: 'bg-sky-50/80 text-sky-800 border-sky-200/80',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
  };

  return (
    <span
      title={title}
      onClick={onClick}
      className={`inline-flex items-center rounded-md border tracking-tight ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
