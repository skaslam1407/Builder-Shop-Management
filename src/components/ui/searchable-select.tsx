import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string | number;
  label: string;
  subLabel?: string;
  keywords?: string[];
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search or select…",
  className,
  disabled,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  useEffect(() => {
    if (selectedOption && !open) {
      setQuery(selectedOption.label);
    } else if (!value && !open) {
      setQuery("");
    }
  }, [selectedOption, value, open]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        if (selectedOption) setQuery(selectedOption.label);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [selectedOption]);

  const filtered = options.filter((opt) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const matchLabel = opt.label.toLowerCase().includes(q);
    const matchSub = opt.subLabel?.toLowerCase().includes(q) ?? false;
    const matchKw = opt.keywords?.some((kw) => kw.toLowerCase().includes(q)) ?? false;
    return matchLabel || matchSub || matchKw;
  });

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={placeholder}
          value={query}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && !disabled ? (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          <div
            className="cursor-pointer px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100"
            onMouseDown={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
          >
            — Clear / None —
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-400">No matching items found</div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.value}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm hover:bg-brand-50 hover:text-brand-900",
                  String(opt.value) === String(value) && "bg-brand-50 font-medium text-brand-900",
                )}
                onMouseDown={() => {
                  onChange(String(opt.value));
                  setQuery(opt.label);
                  setOpen(false);
                }}
              >
                <div className="font-medium text-zinc-900">{opt.label}</div>
                {opt.subLabel ? <div className="text-xs text-zinc-500">{opt.subLabel}</div> : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
