import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.scss";

export type CardPadding = "none" | "small" | "medium" | "large";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: CardPadding;
  hoverable?: boolean;
  bordered?: boolean;
}

export default function Card({
  children,
  padding = "medium",
  hoverable = false,
  bordered = true,
  className = "",
  ...props
}: CardProps) {
  const cardClasses = [
    styles.card,
    styles[padding],
    hoverable ? styles.hoverable : "",
    !bordered ? styles.noBorder : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses} {...props}>
      {children}
    </div>
  );
}
