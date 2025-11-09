import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showLabel?: boolean;
}

export function Logo({ className, showLabel = true }: LogoProps) {
  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <motion.svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="rounded-2xl bg-slate-900/40 p-2 shadow-[0_0_24px_rgba(56,189,248,0.35)] ring-1 ring-sky-500/40"
        initial={{ rotate: -8, scale: 0.94, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 18, duration: 0.4 }}
      >
        <defs>
          <linearGradient id="logo-gradient" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="45%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <motion.path
          d="M20 4C11.1634 4 4 11.1634 4 20C4 28.8366 11.1634 36 20 36C28.8366 36 36 28.8366 36 20C36 11.1634 28.8366 4 20 4ZM28.5 21.8C27.906 24.686 26.058 27.126 23.52 28.512C21 29.884 18.086 29.988 15.48 28.8C12.908 27.624 11.058 25.314 10.5 22.4C10.392 21.844 10.892 21.364 11.46 21.476L15.8 22.34C16.228 22.426 16.538 22.806 16.56 23.242C16.644 24.774 17.87 26 19.4 26C21.024 26 22.34 24.684 22.34 23.06C22.34 21.464 21.086 20.202 19.494 20.2H12.8C11.808 20.2 11 19.392 11 18.4V17.8C11 16.808 11.808 16 12.8 16H19.388C21.156 15.998 22.34 14.812 22.34 13.044C22.34 11.416 21.018 10.094 19.39 10.094C17.886 10.094 16.644 11.294 16.566 12.788C16.544 13.226 16.236 13.606 15.806 13.696L11.45 14.584C10.884 14.698 10.392 14.218 10.5 13.66C11.032 10.916 12.776 8.666 15.14 7.424C17.584 6.132 20.48 6.112 22.92 7.368C25.368 8.622 27.11 10.86 27.692 13.6C27.892 14.554 28.73 15.2 29.7 15.2H30C30.552 15.2 31 15.648 31 16.2V18.4C31 18.952 30.552 19.4 30 19.4H29.7C28.732 19.4 27.898 20.042 27.698 20.99C27.632 21.314 27.624 21.62 27.74 21.906C27.848 22.154 28.12 22.298 28.386 22.24C28.74 22.164 29.086 21.982 29.394 21.7C29.764 21.354 30.332 21.378 30.676 21.748C31.018 22.118 30.996 22.686 30.626 23.03C29.824 23.796 28.864 24.272 27.81 24.48C27.086 24.626 26.348 24.346 25.968 23.706C25.266 22.498 24.454 21.492 23.52 20.676C24.592 20.38 25.502 19.732 26.116 18.85C26.676 18.058 27.05 17.144 27.2 16.174C27.28 15.652 27.744 15.288 28.272 15.36C29.118 15.462 29.958 15.528 30.8 15.556C31.356 15.576 31.82 16.026 31.802 16.58C31.726 19.138 30.558 21.46 28.5 21.8Z"
          fill="url(#logo-gradient)"
          filter="url(#glow)"
          animate={{
            filter: ['url(#glow)', 'url(#glow)'],
            opacity: [0.95, 1],
            scale: [1, 1.02, 1]
          }}
          transition={{
            repeat: Infinity,
            repeatType: 'mirror',
            duration: 4,
            ease: 'easeInOut'
          }}
        />
      </motion.svg>
      {showLabel && (
        <motion.span
          className="ml-3 text-base font-semibold tracking-wide text-slate-100"
          initial={{ x: -8, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.32, ease: 'easeOut', delay: 0.12 }}
        >
          Aurora Ops
        </motion.span>
      )}
    </div>
  );
}

