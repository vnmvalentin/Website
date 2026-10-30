// Nachrichtenfeld, das Server-Emojis, Rollen- und Kanal-Erwähnungen direkt als
// Bild bzw. "@Rolle"/"#kanal" zeigt. Gespeichert wird weiter Discords Rohform
// (<:name:id>, <@&id>, <#id>) — im Feld standen vorher genau diese IDs, und nur
// die Vorschau daneben zeigte, was gemeint war.
//
// Technik: contentEditable statt <textarea>, weil ein Textfeld keine Bilder
// zeigen kann. Der Wert wird bei jeder Eingabe aus dem DOM zurückgelesen
// (serialize); jedes Sonderelement trägt seine Rohform in data-raw. Die
// Schreibmarke wird in "Einheiten" gemessen: ein Zeichen = 1, ein Emoji = 1.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { tokenize } from './discordText';

const units = (parts) => parts.reduce((n, p) => n + (p.type === 'text' ? p.value.length : 1), 0);

/** Index im Rohtext zu einer Einheiten-Position. */
function indexAtUnits(parts, u) {
    let idx = 0;
    for (const p of parts) {
        const len = p.type === 'text' ? p.value.length : 1;
        if (u <= len) return idx + (p.type === 'text' ? u : (u === 0 ? 0 : p.raw.length));
        u -= len;
        idx += p.type === 'text' ? p.value.length : p.raw.length;
    }
    return idx;
}

/** ":name:" eines Server-Emojis wird direkt zum Emoji. */
function autoConvert(text, emojis) {
    if (!emojis.length) return text;
    return text.replace(/(<a?)?:(\w{2,32}):(\d+>)?/g, (m, open, name, close) => {
        if (open || close) return m; // schon Rohform
        const e = emojis.find((x) => x.name === name);
        return e ? (e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`) : m;
    });
}

function buildDom(root, parts) {
    root.textContent = '';
    for (const p of parts) {
        if (p.type === 'text') {
            root.appendChild(document.createTextNode(p.value));
        } else if (p.type === 'emoji') {
            const img = document.createElement('img');
            img.src = p.url;
            img.alt = `:${p.name}:`;
            img.title = `:${p.name}:`;
            img.className = 'dc-emoji';
            img.draggable = false;
            img.dataset.raw = p.raw;
            root.appendChild(img);
        } else {
            const span = document.createElement('span');
            span.className = 'dc-mention';
            span.contentEditable = 'false';
            span.textContent = p.label;
            if (p.color) span.style.color = p.color;
            span.dataset.raw = p.raw;
            root.appendChild(span);
        }
    }
    // Ein Zeilenumbruch am Ende zeigt sonst keine neue Zeile
    if (parts.length && parts[parts.length - 1].type === 'text' && parts[parts.length - 1].value.endsWith('\n')) {
        const br = document.createElement('br');
        br.dataset.tail = '1';
        root.appendChild(br);
    }
}

/** DOM → Rohtext und Einheiten bis zur Schreibmarke. */
function readDom(root) {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount && root.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
    let out = '';
    let u = 0;
    let caret = null;
    const atCaret = (node, offset) => range && range.endContainer === node && range.endOffset === offset;
    const walk = (node) => {
        const kids = node.childNodes;
        for (let i = 0; i <= kids.length; i++) {
            if (caret === null && atCaret(node, i)) caret = u;
            if (i === kids.length) break;
            const n = kids[i];
            if (n.nodeType === 3) {
                if (caret === null && range && range.endContainer === n) caret = u + range.endOffset;
                const v = n.nodeValue.replace(/\u00a0/g, ' ');
                out += v; u += v.length;
            } else if (n.dataset?.raw) {
                out += n.dataset.raw; u += 1;
            } else if (n.nodeName === 'BR') {
                if (!n.dataset?.tail) { out += '\n'; u += 1; }
            } else {
                // Vom Browser angelegte Blöcke (DIV/P) sind neue Zeilen
                if ((n.nodeName === 'DIV' || n.nodeName === 'P') && out && !out.endsWith('\n')) { out += '\n'; u += 1; }
                walk(n);
            }
        }
    };
    walk(root);
    return { text: out, caret: caret ?? u };
}

function placeCaret(root, target) {
    let left = target;
    const sel = window.getSelection();
    const r = document.createRange();
    for (let i = 0; i < root.childNodes.length; i++) {
        const n = root.childNodes[i];
        if (n.dataset?.tail) break;
        const len = n.nodeType === 3 ? n.nodeValue.length : 1;
        if (left <= len) {
            if (n.nodeType === 3) r.setStart(n, left);
            else r.setStart(root, left === 0 ? i : i + 1);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            return;
        }
        left -= len;
    }
    r.selectNodeContents(root);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
}

/**
 * @param {string} value               Rohtext
 * @param {(v: string) => void} onChange
 * @param {Array} emojis               Server-Emojis {id, name, animated, url} — für den Wähler und ":name:"
 * @param {Array} roles / channels     um Erwähnungen lesbar zu zeigen
 * @param {number} rows                Mindesthöhe in Zeilen
 * Über ref: insert(raw) fügt an der Schreibmarke ein.
 */
const EmojiTextField = forwardRef(function EmojiTextField(
    { value, onChange, emojis = [], roles = [], channels = [], rows = 4, placeholder = '', id, ariaLabel },
    ref,
) {
    const box = useRef(null);
    const lastEmitted = useRef(null);
    const lastCaret = useRef(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const ctx = { roles, channels };
    const ctxKey = `${emojis.length}|${roles.length}|${channels.length}`;

    // Von außen geänderten Wert (Laden, Verwerfen) neu zeichnen — die eigene Eingabe nicht,
    // sonst spränge die Schreibmarke.
    useLayoutEffect(() => {
        if (!box.current || value === lastEmitted.current) return;
        buildDom(box.current, tokenize(value, ctx));
        lastEmitted.current = value;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    // Rollen/Kanäle kommen später als der Text: dann einmal neu zeichnen
    useLayoutEffect(() => {
        if (box.current) buildDom(box.current, tokenize(value, ctx));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctxKey]);

    const commit = useCallback((text, caretUnits, redraw) => {
        lastEmitted.current = text;
        if (redraw && box.current) {
            buildDom(box.current, tokenize(text, ctx));
            if (caretUnits !== null && document.activeElement === box.current) placeCaret(box.current, caretUnits);
        }
        lastCaret.current = caretUnits;
        onChange(text);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onChange, ctxKey]);

    /** Rohtext an Einheiten-Position einsetzen (ersetzt nichts). */
    const insertRaw = (raw) => {
        const parts = tokenize(value, ctx);
        const at = lastCaret.current ?? units(parts);
        const idx = indexAtUnits(parts, at);
        const next = value.slice(0, idx) + raw + value.slice(idx);
        const after = units(tokenize(value.slice(0, idx) + raw, ctx));
        box.current?.focus();
        commit(next, after, true);
    };

    useImperativeHandle(ref, () => ({ insert: insertRaw, focus: () => box.current?.focus() }));

    const handleInput = () => {
        const { text, caret } = readDom(box.current);
        const converted = autoConvert(text, emojis);
        if (converted !== text) {
            const parts = tokenize(text, ctx);
            const prefix = text.slice(0, indexAtUnits(parts, caret));
            commit(converted, units(tokenize(autoConvert(prefix, emojis), ctx)), true);
        } else {
            // Der Browser legt manchmal eigene Blöcke an — dann sauber neu zeichnen
            const messy = box.current.querySelector('div, p');
            commit(text, caret, !!messy);
        }
    };

    const remember = () => {
        if (box.current && document.activeElement === box.current) lastCaret.current = readDom(box.current).caret;
    };

    const insertPlain = (str) => {
        const { text, caret } = readDom(box.current);
        const parts = tokenize(text, ctx);
        const sel = window.getSelection();
        // Markierten Text ersetzen
        let start = caret;
        let end = caret;
        if (sel && !sel.isCollapsed) {
            const r = sel.getRangeAt(0);
            const probe = document.createRange();
            probe.setStart(box.current, 0);
            probe.setEnd(r.startContainer, r.startOffset);
            sel.removeAllRanges(); sel.addRange(probe);
            start = readDom(box.current).caret;
            sel.removeAllRanges(); sel.addRange(r);
        }
        const a = indexAtUnits(parts, Math.min(start, end));
        const b = indexAtUnits(parts, Math.max(start, end));
        const next = autoConvert(text.slice(0, a) + str + text.slice(b), emojis);
        commit(next, units(tokenize(autoConvert(text.slice(0, a) + str, emojis), ctx)), true);
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            insertPlain('\n');
        }
    };
    const onPaste = (e) => {
        e.preventDefault();
        insertPlain(e.clipboardData.getData('text/plain'));
    };

    // Wähler schließen beim Klick daneben
    const wrap = useRef(null);
    useEffect(() => {
        if (!pickerOpen) return undefined;
        const close = (e) => { if (!wrap.current?.contains(e.target)) setPickerOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [pickerOpen]);

    return (
        <div ref={wrap} className="relative">
            <div
                ref={box}
                id={id}
                role="textbox"
                aria-multiline="true"
                aria-label={ariaLabel}
                contentEditable
                suppressContentEditableWarning
                data-placeholder={placeholder}
                onInput={handleInput}
                onKeyDown={onKeyDown}
                onKeyUp={remember}
                onMouseUp={remember}
                onBlur={remember}
                onPaste={onPaste}
                onDrop={(e) => e.preventDefault()}
                className="dc-input dc-richtext w-full"
                style={{ minHeight: `${rows * 1.4 + 1.2}em`, paddingRight: emojis.length ? 40 : undefined }}
            />
            {emojis.length > 0 && (
                <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); remember(); }}
                    onClick={() => setPickerOpen((o) => !o)}
                    title="Server-Emoji einfügen"
                    aria-label="Server-Emoji einfügen"
                    aria-expanded={pickerOpen}
                    className={`absolute right-1.5 top-1.5 p-1.5 rounded transition-colors ${pickerOpen ? 'text-white bg-white/10' : 'text-white/45 hover:text-white hover:bg-white/10'}`}
                >
                    <Smile size={16} />
                </button>
            )}
            {pickerOpen && (
                <div className="dc-popover absolute right-0 top-full mt-1 z-50 w-72 p-2">
                    <div className="grid grid-cols-7 gap-0.5 max-h-52 overflow-y-auto custom-scrollbar">
                        {emojis.map((e) => (
                            <button
                                key={e.id}
                                type="button"
                                title={`:${e.name}:`}
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => { insertRaw(e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`); setPickerOpen(false); }}
                                className="p-1.5 rounded hover:bg-white/10 flex items-center justify-center"
                            >
                                <img src={e.url} alt={e.name} className="w-6 h-6 object-contain" />
                            </button>
                        ))}
                    </div>
                    <p className="px-1 pt-2 text-[11px] text-white/40">Tipp: <b className="text-white/60">:name:</b> tippen wird auch zum Emoji.</p>
                </div>
            )}
        </div>
    );
});

export default EmojiTextField;
