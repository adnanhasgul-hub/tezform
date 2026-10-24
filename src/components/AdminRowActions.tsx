import { useEffect, useId, useRef, useState } from "react";
import type { InvestigationState } from "../services/adminModel";
import "./admin-actions.css";

export type AdminRowAction = "edit" | "view" | "print" | "full-edit" | "delete";

interface Props {
  subjectCode: string;
  state: InvestigationState;
  onAction: (action: AdminRowAction) => void;
}

/** The native popover top layer keeps this menu out of the table's scroll clip. */
export function AdminRowActions({ subjectCode, state, onAction }: Props) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function positionMenu() {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const bounds = trigger.getBoundingClientRect();
    const padding = 12;
    const gap = 6;
    const width = Math.min(236, window.innerWidth - padding * 2);
    const height = menu.offsetHeight || 116;
    const left = Math.max(
      padding,
      Math.min(bounds.right - width, window.innerWidth - width - padding),
    );
    const top =
      bounds.bottom + gap + height <= window.innerHeight - padding
        ? bounds.bottom + gap
        : Math.max(padding, bounds.top - gap - height);
    menu.style.width = `${width}px`;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  useEffect(() => {
    if (!open) return;
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function closeMenu(returnFocus = false) {
    menuRef.current?.hidePopover();
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(action: AdminRowAction) {
    closeMenu();
    onAction(action);
  }

  function focusItem(last = false) {
    const items =
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!items?.length) return;
    items[last ? items.length - 1 : 0]?.focus();
  }

  return (
    <div className="admin-row-actions">
      <button
        type="button"
        className="button primary admin-action-button admin-primary-action"
        onClick={() => onAction("edit")}
      >
        {state === "empty"
          ? "Formu Tamamla"
          : state === "partial"
            ? "Devam Et"
            : "Bölüm 4 Düzenle"}
      </button>
      <button
        type="button"
        className="button secondary admin-action-button"
        onClick={() => onAction("view")}
      >
        Görüntüle
      </button>
      <button
        type="button"
        className="button secondary admin-action-button"
        onClick={() => onAction("print")}
      >
        Yazdır
      </button>
      <button
        ref={triggerRef}
        type="button"
        className="button secondary admin-action-button admin-more-action"
        aria-label={`Diğer işlemler: ${subjectCode}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        popoverTarget={menuId}
        onClick={positionMenu}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          positionMenu();
          menuRef.current?.showPopover();
          focusItem(event.key === "ArrowUp");
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={`${subjectCode} diğer işlemler`}
        className="admin-row-menu"
        onToggle={(event) => {
          const visible = event.currentTarget.matches(":popover-open");
          setOpen(visible);
          if (visible) positionMenu();
        }}
        onBlur={() =>
          queueMicrotask(() => {
            const focus = document.activeElement;
            if (
              focus &&
              !menuRef.current?.contains(focus) &&
              focus !== triggerRef.current
            )
              closeMenu();
          })
        }
        onKeyDown={(event) => {
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]',
            ),
          ];
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (event.key === "Escape") {
            event.preventDefault();
            closeMenu(true);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const next =
              event.key === "ArrowDown"
                ? (index + 1) % items.length
                : (index - 1 + items.length) % items.length;
            items[next]?.focus();
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            focusItem(event.key === "End");
          }
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => choose("full-edit")}
        >
          Tüm Formu Düzenle
        </button>
        <hr role="separator" />
        <button
          type="button"
          role="menuitem"
          className="admin-menu-danger"
          onClick={() => choose("delete")}
        >
          Sil
        </button>
      </div>
    </div>
  );
}
