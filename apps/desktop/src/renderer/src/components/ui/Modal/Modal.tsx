import { useEffect, useId, type ReactNode, type MouseEvent } from "react";
import { X } from "lucide-react";
import styles from "./Modal.module.scss";

export type ModalSize = "small" | "medium" | "large" | "extraLarge";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "medium",
  closeOnOverlayClick = true,
  showCloseButton = true,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={handleOverlayClick}>
      <section
        className={`${styles.modal} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>

            {description && (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            )}
          </div>

          {showCloseButton && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={19} />
            </button>
          )}
        </header>

        <div className={styles.body}>{children}</div>

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </section>
    </div>
  );
}
