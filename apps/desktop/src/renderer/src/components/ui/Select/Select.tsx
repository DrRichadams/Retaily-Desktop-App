import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import styles from "./Select.module.scss";

export type SelectSize = "small" | "medium" | "large";

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  label?: string;
  helperText?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  fieldSize?: SelectSize;
  leftIcon?: ReactNode;
  fullWidth?: boolean;
}

export default function Select({
  label,
  helperText,
  error,
  options,
  placeholder = "Select an option",
  fieldSize = "medium",
  leftIcon,
  fullWidth = true,
  id,
  className = "",
  disabled,
  required,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = `${selectId}-message`;

  const hasMessage = Boolean(error || helperText);

  const containerClasses = [styles.container, fullWidth ? styles.fullWidth : ""]
    .filter(Boolean)
    .join(" ");

  const fieldClasses = [
    styles.field,
    styles[fieldSize],
    leftIcon ? styles.hasLeftIcon : "",
    error ? styles.invalid : "",
    disabled ? styles.disabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}

      <div className={fieldClasses}>
        {leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}

        <select
          {...props}
          id={selectId}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={hasMessage ? messageId : undefined}
          className={`${styles.select} ${className}`}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}

          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>

        <span className={styles.dropdownIcon}>
          <ChevronDown size={17} />
        </span>
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
