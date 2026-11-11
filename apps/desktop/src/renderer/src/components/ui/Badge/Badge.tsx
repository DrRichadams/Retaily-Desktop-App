import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Badge.module.scss";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "dark";

export type BadgeSize = "small" | "medium" | "large";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function Badge({
  variant = "neutral",
  size = "medium",
  dot = false,
  icon,
  children,
  className = "",
  ...props
}: BadgeProps) {
  const badgeClasses = [styles.badge, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={badgeClasses} {...props}>
      {dot && <span className={styles.dot} aria-hidden="true" />}

      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}

      <span className={styles.label}>{children}</span>
    </span>
  );
}
