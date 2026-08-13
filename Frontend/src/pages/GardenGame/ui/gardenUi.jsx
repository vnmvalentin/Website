// ui/gardenUi.jsx
// Gemeinsame Komponenten des Virtual-Farm-HUDs.
// Konstanten, Icon-Zuordnungen und Formatierer liegen daneben in gardenTokens.js.
import React from 'react';
import { Coins, X } from 'lucide-react';
import { RARITY_TEXT } from './gardenTokens';

export function RarityLabel({ rarity, className = "" }) {
    const r = rarity || "COMMON";
    return (
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${RARITY_TEXT[r] || RARITY_TEXT.COMMON} ${className}`}>
            {r}
        </span>
    );
}

/** Kompakte Kennzahl: Label links, Wert rechts. */
export function StatLine({ icon: Icon, label, value, valueClass = "text-white" }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                {Icon ? <Icon size={12} className="shrink-0" /> : null}
                {label}
            </span>
            <span className={`text-xs font-semibold tabular-nums ${valueClass}`}>{value}</span>
        </div>
    );
}

export function ProgressBar({ value, className = "bg-violet-500", height = "h-1.5" }) {
    const pct = Math.max(0, Math.min(100, (Number(value) || 0) * 100));
    return (
        <div className={`w-full ${height} bg-slate-800 rounded-sm overflow-hidden`}>
            <div className={`h-full ${className} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
        </div>
    );
}

/**
 * Einheitlicher Rahmen für alle Garten-Modals. Vorher hatte jedes Modal seine
 * eigene Kopfzeile, eigene Radien und einen eigenen Schließen-Button.
 */
export function GardenModal({ title, subtitle, headerRight, onClose, width = "max-w-3xl", children, footer }) {
    return (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`w-full ${width} max-h-[86vh] flex flex-col bg-slate-900 border border-slate-700 rounded-md shadow-xl`}>
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-white tracking-tight">{title}</h2>
                        {subtitle ? <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div> : null}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {headerRight}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Schließen"
                            className="text-slate-500 hover:text-white transition-colors p-1 rounded-sm"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4" style={{ overscrollBehavior: "contain" }}>
                    {children}
                </div>
                {footer ? <div className="px-5 py-3 border-t border-slate-800">{footer}</div> : null}
            </div>
        </div>
    );
}

/** Gold-Anzeige für Modal-Kopfzeilen. */
export function GoldTag({ gold }) {
    return (
        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-400 tabular-nums">
            <Coins size={14} />
            {Number(gold || 0).toLocaleString("de-DE")}
        </span>
    );
}

/**
 * Unterstrich-Tabs statt Pillen.
 * flex-wrap statt overflow-x-auto: der Scroll-Container ließ sich immer ein, zwei Pixel
 * verschieben, wodurch die Kategorienleiste minimal scrollbar wirkte.
 */
export function TabBar({ tabs, active, onSelect }) {
    return (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 mb-4">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = active === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onSelect(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                            isActive
                                ? "border-violet-500 text-white"
                                : "border-transparent text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        {Icon ? <Icon size={13} /> : null}
                        {tab.label}
                        {tab.count !== undefined ? (
                            <span className="text-[10px] text-slate-500 tabular-nums">{tab.count}</span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

export function PrimaryButton({ children, className = "", ...props }) {
    return (
        <button
            type="button"
            className={`px-3 py-2 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold transition-colors ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
