"use client";

import { Check, Clock3, Megaphone, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatDateTime } from "@/lib/format";
import type { AppLocale, TFunction } from "@/lib/i18n";
import type { PanelAnnouncement } from "@/lib/types";

interface AnnouncementModalProps {
  announcement: PanelAnnouncement | null;
  locale: AppLocale;
  onClose: () => void;
  open: boolean;
  timeZone: string;
  t: TFunction;
}

export function AnnouncementModal({
  announcement,
  locale,
  onClose,
  open,
  timeZone,
  t
}: AnnouncementModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open || !announcement) return null;

  return (
    <div
      className="announcement-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="announcement-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="announcement-modal__header">
          <div className="announcement-modal__icon" aria-hidden>
            <Megaphone size={21} />
          </div>
          <div className="announcement-modal__heading">
            <span className="announcement-modal__label">{t("announcement.unread")}</span>
            <h2 id={titleId}>{announcement.title}</h2>
            <p>
              <Clock3 size={14} aria-hidden />
              {t("announcement.updatedAt")} {formatDateTime(
                announcement.updatedAt,
                locale,
                t("common.unknown"),
                timeZone
              )}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            className="announcement-modal__close"
            type="button"
            onClick={onClose}
            aria-label={t("announcement.close")}
            title={t("announcement.close")}
          >
            <X size={19} aria-hidden />
          </button>
        </header>

        <div className="announcement-modal__body">
          <div className="announcement-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                )
              }}
            >
              {announcement.content}
            </ReactMarkdown>
          </div>
        </div>

        <footer className="announcement-modal__footer">
          <span>
            {t("announcement.publishedAt")} {formatDateTime(
              announcement.createdAt,
              locale,
              t("common.unknown"),
              timeZone
            )}
          </span>
          <button type="button" onClick={onClose}>
            <Check size={17} aria-hidden />
            {t("announcement.acknowledge")}
          </button>
        </footer>
      </section>
    </div>
  );
}
