import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { LoaderCircle, Search, X } from "lucide-react";
import styles from "./SearchInput.module.scss";

export type SearchInputSize = "small" | "medium" | "large";

interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "type"
> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputSize?: SearchInputSize;
  loading?: boolean;
  showShortcut?: boolean;
  shortcut?: string;
  leftElement?: ReactNode;
  fullWidth?: boolean;
  onClear?: () => void;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  inputSize = "medium",
  loading = false,
  showShortcut = false,
  shortcut = "⌘ K",
  leftElement,
  fullWidth = false,
  onClear,
  disabled = false,
  className = "",
  ...props
}: SearchInputProps) {
  const inputId = useId();

  const containerClasses = [
    styles.container,
    styles[inputSize],
    fullWidth ? styles.fullWidth : "",
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleClear = () => {
    onChange("");
    onClear?.();
  };

  return (
    <div className={containerClasses}>
      <label htmlFor={inputId} className={styles.icon} aria-label="Search">
        {leftElement ?? <Search size={17} />}
      </label>

      <input
        {...props}
        id={inputId}
        type="search"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="off"
      />

      {loading && (
        <LoaderCircle
          size={16}
          className={styles.spinner}
          aria-label="Searching"
        />
      )}

      {!loading && value.length > 0 && !disabled && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X size={15} />
        </button>
      )}

      {!loading && value.length === 0 && showShortcut && (
        <span className={styles.shortcut}>{shortcut}</span>
      )}
    </div>
  );
}
