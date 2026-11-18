"use client";

import { useId, useState } from "react";

export type SearchOption = { id: string; name: string; detail?: string };

export function searchableText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

export function SearchSelect({ label, search, value, options, onSearch, onSelect, loading = false, disabled = false,
  inputName, placeholder, emptyMessage = "Nenhum resultado encontrado.", children }: {
  label: string; search: string; value: string; options: SearchOption[];
  onSearch: (text: string) => void; onSelect: (option: SearchOption) => void;
  loading?: boolean; disabled?: boolean; inputName?: string; placeholder?: string; emptyMessage?: string; children?: React.ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const results = options.slice(0, 3);
  function choose(option: SearchOption) {
    onSelect(option);
    setOpen(false);
    setActive(-1);
  }
  return <div className="search-select" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open}
      aria-controls={id + "-list"} aria-activedescendant={open && !loading && active >= 0 && results[active] ? id + "-option-" + active : undefined}
      autoComplete="off" maxLength={100} name={inputName} value={search} disabled={disabled} placeholder={placeholder}
      onFocus={() => { setOpen(true); setActive(-1); }}
      onChange={(event) => { onSearch(event.currentTarget.value); setOpen(true); setActive(-1); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          if (!loading && results.length) setActive((previous) => event.key === "ArrowDown"
            ? (previous + 1) % results.length : (previous <= 0 ? results.length : previous) - 1);
        }
        if (event.key === "Enter" && open) {
          event.preventDefault();
          if (!loading && results.length && (!value || active >= 0)) choose(results[active >= 0 ? active : 0]);
          else setOpen(false);
        }
      }} />
    {open && <div className="search-select-panel">
      <div id={id + "-list"} role="listbox" aria-label={label} aria-busy={loading}>
        {!loading && results.map((option, index) => <button type="button" role="option" id={id + "-option-" + index}
          key={option.id} aria-selected={active >= 0 ? active === index : value === option.id}
          onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          <span>{option.name}</span>{option.detail && <small>{option.detail}</small>}
        </button>)}
      </div>
      {loading ? <p role="status">Buscando…</p> : !results.length && <p role="status">{emptyMessage}</p>}
      {children}
    </div>}
  </div>;
}
