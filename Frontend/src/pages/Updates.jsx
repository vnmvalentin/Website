import React from "react";
import { NEWS_UPDATES } from "../utils/newData";

export default function Updates() {
  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="mb-12 border-b border-white/10 pb-6">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
          Updates & News
        </h1>
        <p className="text-gray-400 mt-3 text-lg">
          Alle Neuerungen, Fixes und Features im Überblick.
        </p>
      </div>

      <div className="space-y-10">
        {NEWS_UPDATES.map((update, idx) => (
          <div
            key={idx}
            className="bg-[#1a1a20] border border-white/5 rounded-md p-6 md:p-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-2">
              <h2 className="text-xl font-bold text-white">{update.version}</h2>
              <span className="text-sm font-mono text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-sm border border-cyan-500/20 w-fit">
                {update.date}
              </span>
            </div>

            <div className="space-y-8">
              {update.sections.map((sec, sIdx) => (
                <div key={sIdx}>
                  <h3 className="font-bold text-lg text-gray-200 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                    {sec.title}
                  </h3>
                  <ul className="space-y-3 pl-4">
                    {sec.items.map((item, iIdx) => (
                      <li key={iIdx} className="text-gray-400 text-base flex items-start gap-3">
                        <span className="text-gray-600 mt-1">▹</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
