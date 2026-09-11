import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700",
  ghost: "border border-zinc-300 text-zinc-800 hover:bg-zinc-50",
};

export function buttonClassName(variant: Variant = "primary", className = ""): string {
  return [
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button {...props} className={buttonClassName(variant, className)} />;
}
