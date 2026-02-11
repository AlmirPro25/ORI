import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', ...props }, ref) => {
        const base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
        const variants = {
            default: "bg-nexus-accent text-black hover:bg-nexus-accent/80 shadow-glow",
            outline: "border border-nexus-border bg-transparent hover:bg-nexus-accent hover:text-black",
            ghost: "hover:bg-nexus-accent/10 hover:text-nexus-accent",
        };
        const sizes = {
            default: "h-10 px-4 py-2",
            sm: "h-9 px-3",
            lg: "h-12 px-8 uppercase tracking-widest",
        };
        return (
            <button className={cn(base, variants[variant], sizes[size], className)} ref={ref} {...props} />
        );
    }
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { }

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-10 w-full rounded-md border border-nexus-border bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-accent disabled:cursor-not-allowed disabled:opacity-50 font-mono",
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn("rounded-lg border border-nexus-border bg-nexus-card text-nexus-text shadow-sm", className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn("p-6 pt-0", className)} {...props} />
);
