"use client";

import { useState } from "react";
import { SearchSelect, searchableText, type SearchOption } from "../search-select";

export function ModalityPicker({ options, value, onChange, label = "Modalidade" }: {
  options: SearchOption[]; value: string; onChange: (id: string) => void; label?: string;
}) {
  const [typed, setTyped] = useState("");
  const selected = options.find((option) => option.id === value);
  const search = selected?.name ?? typed;
  const query = searchableText(search);
  const matches = options.filter((option) => searchableText(option.name + " " + (option.detail ?? "")).includes(query));
  return <div>
    <SearchSelect label={label} search={search} value={value} options={matches} placeholder="Digite para buscar"
      onSearch={(text) => { setTyped(text); onChange(""); }}
      onSelect={(option) => { setTyped(option.name); onChange(option.id); }}
      emptyMessage={options.length ? "Nenhuma modalidade encontrada." : "Escolha uma categoria com modalidades cadastradas."} />
  </div>;
}
