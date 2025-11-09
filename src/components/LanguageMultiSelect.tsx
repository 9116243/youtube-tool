import { useMemo, useState } from "react";
import { X, Check, Search, ChevronDown } from "lucide-react";

import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface LanguageMultiSelectProps {
  value: LanguageCode[];
  onChange: (value: LanguageCode[]) => void;
  className?: string;
  placeholder?: string;
}

const HOT_APAC: LanguageCode[] = ["zh-CN", "zh-TW", "ja-JP", "ko-KR", "vi-VN", "th-TH", "id-ID", "ms-MY", "en-US"];
const HOT_EMEA: LanguageCode[] = ["en-GB", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-PT", "nl-NL", "pl-PL", "sv-SE"];
const HOT_LATAM: LanguageCode[] = ["es-MX", "pt-BR", "en-US"];
const HOT_MENA: LanguageCode[] = ["ar-SA", "tr-TR", "he-IL", "fa-IR"];

export function LanguageMultiSelect({
  value,
  onChange,
  className,
  placeholder = "Select languages",
}: LanguageMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return LANGUAGES;
    return LANGUAGES.filter(
      (lang) =>
        lang.name.toLowerCase().includes(keyword) ||
        lang.englishName.toLowerCase().includes(keyword) ||
        lang.code.toLowerCase().includes(keyword),
    );
  }, [query]);

  const toggle = (code: LanguageCode) => {
    onChange(value.includes(code) ? value.filter((item) => item !== code) : [...value, code]);
  };

  const containsAll = (codes: LanguageCode[]) => codes.every((code) => value.includes(code));
  const addSet = (codes: LanguageCode[]) => onChange(Array.from(new Set([...value, ...codes])));
  const removeSet = (codes: LanguageCode[]) => onChange(value.filter((code) => !codes.includes(code)));
  const selectAllFiltered = () =>
    onChange(Array.from(new Set([...value, ...filtered.map((lang) => lang.code as LanguageCode)])));
  const clearAll = () => onChange([]);

  return (
    <div className={className}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-[320px] justify-between">
            <span className="truncate">
              {value.length > 0 ? `${value.length} languages selected` : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-[860px]">
          <DialogHeader>
            <DialogTitle>Select target languages</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {value.map((code) => {
              const meta = LANGUAGES.find((item) => item.code === code);
              if (!meta) return null;
              return (
                <Badge key={code} variant="secondary" className="gap-1">
                  <span className="text-base">{meta.flag}</span>
                  {meta.name}
                  <button
                    className="ml-1 opacity-70 hover:opacity-100"
                    onClick={() => toggle(code)}
                    aria-label={`Remove ${meta.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              );
            })}
            {!value.length ? (
              <span className="text-sm text-slate-400">No languages selected yet.</span>
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Quick picks:</span>
            <Button
              size="sm"
              variant={containsAll(HOT_APAC) ? "default" : "outline"}
              onClick={() => (containsAll(HOT_APAC) ? removeSet(HOT_APAC) : addSet(HOT_APAC))}
            >
              APAC
            </Button>
            <Button
              size="sm"
              variant={containsAll(HOT_EMEA) ? "default" : "outline"}
              onClick={() => (containsAll(HOT_EMEA) ? removeSet(HOT_EMEA) : addSet(HOT_EMEA))}
            >
              EMEA
            </Button>
            <Button
              size="sm"
              variant={containsAll(HOT_LATAM) ? "default" : "outline"}
              onClick={() => (containsAll(HOT_LATAM) ? removeSet(HOT_LATAM) : addSet(HOT_LATAM))}
            >
              LATAM
            </Button>
            <Button
              size="sm"
              variant={containsAll(HOT_MENA) ? "default" : "outline"}
              onClick={() => (containsAll(HOT_MENA) ? removeSet(HOT_MENA) : addSet(HOT_MENA))}
            >
              MENA
            </Button>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={selectAllFiltered}>
                Select filtered
              </Button>
              <Button size="sm" variant="outline" onClick={clearAll}>
                Clear
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Search className="h-4 w-4 opacity-70" />
            <Input
              placeholder="Search by native or English name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <ScrollArea className="mt-4 max-h-[460px] rounded-md border border-white/10">
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((lang) => {
                const checked = value.includes(lang.code as LanguageCode);
                return (
                  <li key={lang.code} className="border-b border-white/5">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                      onClick={() => toggle(lang.code as LanguageCode)}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(lang.code as LanguageCode)}
                        aria-label={`Toggle ${lang.name}`}
                      />
                      <span className="w-6 text-center text-xl">{lang.flag}</span>
                      <div className="flex-1">
                        <div className="text-sm text-white">{lang.name}</div>
                        <div className="text-xs text-slate-400">
                          {lang.englishName} | {lang.code}
                        </div>
                      </div>
                      {checked ? <Check className="h-4 w-4 text-cyan-300" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LanguageMultiSelect;
