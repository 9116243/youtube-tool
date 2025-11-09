import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-DEFAULT/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        default:
          'bg-brand-DEFAULT text-slate-950 shadow-glass hover:bg-brand-soft focus-visible:ring-brand-DEFAULT',
        secondary:
          'bg-[rgba(255,255,255,0.08)] text-foreground hover:bg-[rgba(255,255,255,0.12)]',
        outline:
          'border border-[rgba(255,255,255,0.18)] bg-transparent text-foreground hover:bg-[rgba(255,255,255,0.08)]',
        ghost: 'hover:bg-[rgba(255,255,255,0.08)] hover:text-foreground',
        destructive: 'bg-destructive text-white hover:bg-red-500'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-2xl px-6 text-base',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
