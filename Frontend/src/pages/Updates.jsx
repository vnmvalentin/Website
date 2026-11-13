import React, { useState } from "react";
import { NEWS_UPDATES } from "../utils/newData";
import SEO from "../components/SEO";
import { Page, PageHeader, Card } from "../components/ui";
import { ChevronDown } from "lucide-react";

function splitVersion(version) {
  const idx = String(version || "").indexOf(":");
  if (idx === -1) return { num: version, title: "" };
  return { num: version.slice(0, idx).trim(), title: version.slice(idx + 1).trim() };
}

function UpdateEntry({ update, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const { num, title } = splitVersion(update.version);

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="shrink-0 text-xs font-mono font-bold text-accent-soft bg-accent/10 border border-accent/25 px-2.5 py-1 rounded-md">
          {num}
        </span>
        <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">
          {title || num}
        </span>
        <span className="shrink-0 text-xs font-mono text-white/30">{update.date}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="dropdown-in px-5 md:px-8 pb-8 pt-2 space-y-8 border-t border-line">
          {update.sections.map((sec, sIdx) => (
            <div key={sIdx} className="pt-6">
              <h3 className="font-semibold text-base text-white/85 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-soft shrink-0" />
                {sec.title}
              </h3>
              <ul className="space-y-3 pl-4">
                {sec.items.map((item, iIdx) => (
                  <li key={iIdx} className="text-white/55 text-sm flex items-start gap-3">
                    <span className="text-white/25 mt-0.5">▹</span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Updates() {
  return (
    <Page width="default" className="py-6">
      <SEO
        title="Updates"
        description="Alle Neuerungen, Fixes und Features im Überblick."
        path="/updates"
      />
      <PageHeader kicker="Changelog" title="Updates & News" description="Alle Neuerungen, Fixes und Features im Überblick." />

      <div className="space-y-3">
        {NEWS_UPDATES.map((update, idx) => (
          <UpdateEntry key={idx} update={update} defaultOpen={idx === 0} />
        ))}
      </div>
    </Page>
  );
}
