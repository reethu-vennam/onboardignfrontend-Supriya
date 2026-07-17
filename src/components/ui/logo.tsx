import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import sabbpeLogo from '@/assets/sabbpe-logo.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  sticky?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ 
  className, 
  size = 'md', 
  sticky = false 
}) => {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'h-8 sm:h-10',
    md: 'h-12 sm:h-16 md:h-20',
    lg: 'h-16 sm:h-20 md:h-24'
  };

  const containerClasses = cn(
    "flex items-center justify-center group cursor-pointer",
    sticky && "sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 py-2",
    className
  );

  const logoClasses = cn(
    sizeClasses[size],
    "transition-all duration-300 ease-out",
    "group-hover:scale-105 group-hover:drop-shadow-[0_0_20px_hsl(var(--accent)/0.4)]",
    "object-contain"
  );

  const fallbackClasses = cn(
    "font-bold text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent",
    "transition-all duration-300 ease-out group-hover:scale-105",
    size === 'sm' && "text-xl sm:text-2xl",
    size === 'md' && "text-2xl sm:text-3xl md:text-4xl",
    size === 'lg' && "text-3xl sm:text-4xl md:text-5xl"
  );

  return (
    <Link to="/" className={containerClasses}>
      {!imageError ? (
        <img
          src={sabbpeLogo}
          alt="SabbPe Logo"
          className={logoClasses}
          onError={() => setImageError(true)}
          loading="eager"
          decoding="async"
          style={{ imageRendering: 'auto' }}
        />
      ) : (
        <div className={fallbackClasses}>
          SabbPe
        </div>
      )}
    </Link>
  );
};