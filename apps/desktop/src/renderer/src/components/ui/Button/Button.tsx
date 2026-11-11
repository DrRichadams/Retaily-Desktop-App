import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import styles from "./Button.module.scss";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

export type ButtonSize = "small" | "medium" | "large";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "medium",
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const buttonClasses = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
    loading ? styles.loading : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={buttonClasses}
    >
      {loading ? (
        <LoaderCircle className={styles.spinner} size={17} />
      ) : (
        leftIcon && <span className={styles.icon}>{leftIcon}</span>
      )}

      <span>{children}</span>

      {!loading && rightIcon && (
        <span className={styles.icon}>{rightIcon}</span>
      )}
    </button>
  );
}
