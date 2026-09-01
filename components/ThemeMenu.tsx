"use client";

import { Check, MonitorCog, Moon, Sun, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TFunction, TranslationKey } from "@/lib/i18n";
import { useTheme, type ThemeChoice } from "@/lib/theme";

interface ThemeMenuProps {
  t: TFunction;
}

const themeOptions: Array<{
  choice: ThemeChoice;
  icon: LucideIcon;
  label: TranslationKey;
}> = [
  { choice: "auto", icon: MonitorCog, label: "theme.auto" },
  { choice: "light", icon: Sun, label: "theme.light" },
  { choice: "dark", icon: Moon, label: "theme.dark" }
];

export function ThemeMenu({ t }: ThemeMenuProps) {
  const { choice, setChoice } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = themeOptions.find((option) => option.choice === choice) ?? themeOptions[0];
  const SelectedIcon = selected.icon;
  const accessibleLabel = `${t("theme.change")}: ${t(selected.label)}`;

  const restoreTriggerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLButtonElement>(".theme-button")?.focus();
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    rootRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        restoreTriggerFocus();
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const options = Array.from(
        rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
      );
      if (!options.length || !rootRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      const currentIndex = Math.max(0, options.indexOf(document.activeElement as HTMLButtonElement));
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % options.length
            : (currentIndex - 1 + options.length) % options.length;
      options[nextIndex]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, restoreTriggerFocus]);

  return (
    <div className="theme-menu" ref={rootRef}>
      <button
        className="icon-button theme-button"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={accessibleLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        title={accessibleLabel}
      >
        <SelectedIcon size={18} aria-hidden />
        <span>{t(selected.label)}</span>
      </button>
      {open ? (
        <div className="theme-menu__popover" role="menu" aria-label={t("theme.label")}>
          {themeOptions.map((option) => {
            const OptionIcon = option.icon;
            const active = option.choice === choice;
            return (
              <button
                key={option.choice}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setChoice(option.choice);
                  setOpen(false);
                  restoreTriggerFocus();
                }}
              >
                <OptionIcon size={17} aria-hidden />
                <span>{t(option.label)}</span>
                <Check className="theme-menu__check" size={16} aria-hidden data-visible={active} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
