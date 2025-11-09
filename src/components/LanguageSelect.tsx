import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LanguageSelectProps {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  className?: string;
}

export function LanguageSelect({ value, onChange, className }: LanguageSelectProps) {
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

  const current = LANGUAGES.find((lang) => lang.code === value);

  return (
    <div className={className}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-[280px] justify-between">
            <span className="truncate">
              {current ? `${current.flag} ${current.name} | ${current.code}` : "Select language"}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Select language</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search by native or English name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ScrollArea className="mt-4 max-h-[480px] rounded-md border border-white/10">
            <ul className="divide-y divide-white/5">
              {filtered.map((lang) => (
                <li key={lang.code}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                    onClick={() => {
                      onChange(lang.code as LanguageCode);
                      setOpen(false);
                    }}
                  >
                    <span className="w-6 text-center text-xl">{lang.flag}</span>
                    <div className="flex-1">
                      <div className="text-sm text-white">{lang.name}</div>
                      <div className="text-xs text-slate-400">
                        {lang.englishName} | {lang.code}
                      </div>
                    </div>
                    {value === lang.code ? <Check className="h-4 w-4 text-cyan-300" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LanguageSelect;

