import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import styles from "./Input.module.scss";

export type InputSize = "small" | "medium" | "large";

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  label?: string;
  helperText?: string;
  error?: string;
  fieldSize?: InputSize;
  leftIcon?: ReactNode;
  rightElement?: ReactNode;
  fullWidth?: boolean;
}

export default function Input({
  label,
  helperText,
  error,
  fieldSize = "medium",
  leftIcon,
  rightElement,
  fullWidth = true,
  id,
  className = "",
  disabled,
  required,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;

  const hasMessage = Boolean(error || helperText);

  const containerClasses = [styles.container, fullWidth ? styles.fullWidth : ""]
    .filter(Boolean)
    .join(" ");

  const fieldClasses = [
    styles.field,
    styles[fieldSize],
    leftIcon ? styles.hasLeftIcon : "",
    rightElement ? styles.hasRightElement : "",
    error ? styles.invalid : "",
    disabled ? styles.disabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}

      <div className={fieldClasses}>
        {leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}

        <input
          {...props}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={hasMessage ? messageId : undefined}
          className={`${styles.input} ${className}`}
        />

        {rightElement && (
          <span className={styles.rightElement}>{rightElement}</span>
        )}
      </div>

      {hasMessage && (
        <span
          id={messageId}
          className={error ? styles.errorMessage : styles.helperText}
          role={error ? "alert" : undefined}
        >
          {error || helperText}
        </span>
      )}
    </div>
  );
}
