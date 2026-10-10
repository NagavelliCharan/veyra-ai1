import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2 font-medium',
    lg: 'text-sm px-4.5 py-2.5 gap-2.5 font-medium',
  };

  const variantStyles = {
    primary:
      'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs focus:ring-indigo-500/40 active:translate-y-px',
    secondary:
      'bg-stone-100 hover:bg-stone-200/80 text-stone-800 border border-stone-200 focus:ring-stone-400 active:translate-y-px',
    danger:
      'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 focus:ring-red-400 active:translate-y-px',
    outline:
      'bg-white border border-stone-200 hover:border-stone-300 text-stone-700 hover:bg-stone-50/80 shadow-xs focus:ring-stone-300 active:translate-y-px',
    ghost:
      'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70 focus:ring-stone-300',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
