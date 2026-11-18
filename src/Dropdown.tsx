import { useId, useRef, useState } from "react";
import "./Dropdown.css";

type Option = { value: string; label: string };

export default function Dropdown({ label, value, options, disabled, onChange }: {
  label: string; value: string; options: Option[]; disabled?: boolean; onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);
  const enabled = !disabled && options.length > 0;
  return <div className="dashboard-dropdown" data-dropdown-open={open && enabled} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (open && event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
    if (!enabled || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setOpen(true);
    const target = event.target;
    const key = event.key;
    requestAnimationFrame(() => {
      const buttons = [...(list.current?.querySelectorAll("button") ?? [])];
      const current = buttons.indexOf(target as HTMLButtonElement);
      const index = key === "Home" ? 0 : key === "End" ? buttons.length - 1 : current === -1
        ? Math.max(0, options.findIndex(option => option.value === value))
        : (current + (key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length;
      buttons[index]?.focus();
    });
  }}>
    <button ref={trigger} className="dropdown-button dropdown-trigger" type="button" aria-label={`${label}: ${selected?.label ?? "—"}`} aria-expanded={open && enabled} aria-controls={id} disabled={!enabled} onClick={() => setOpen(!open)}>
      <span>{selected?.label ?? "—"}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div ref={list} className="dropdown-options" id={id} hidden={!open || !enabled} role="group" aria-label={label}>
      {options.map(option => <button className="dropdown-button" type="button" key={option.value} aria-pressed={option === selected} onClick={() => {
        setOpen(false);
        trigger.current?.focus();
        onChange(option.value);
      }}><span>{option.label}</span>{option === selected && <span aria-hidden="true">✓</span>}</button>)}
    </div>
  </div>;
}
