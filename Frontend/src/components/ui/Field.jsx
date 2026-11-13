// Field.jsx — Eingabefelder im Website-Layout: Input, Select, Textarea und die Beschriftung drumherum.
//
// Vorher gab es sechs Kombinationen aus bg-black/20…40 und border-white/5…10. Jetzt eine.
// Die Felder reichen alle übrigen Props an das echte Element durch (value, onChange, ref …).
import React, { forwardRef, useId } from "react";

const FIELD =
  "w-full rounded-lg bg-black/30 border border-line text-sm text-white placeholder:text-white/30 " +
  "transition-colors hover:border-white/20 focus:border-accent focus:outline-none " +
  "disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-danger";

export const Input = forwardRef(function Input({ className = "", ...rest }, ref) {
  return <input ref={ref} className={`${FIELD} h-10 px-3 ${className}`} {...rest} />;
});

export const Select = forwardRef(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${FIELD} h-10 px-3 pr-8 ${className}`} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className = "", rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={`${FIELD} px-3 py-2.5 resize-y custom-scrollbar ${className}`} {...rest} />;
});

/**
 * Beschriftung + Hinweis/Fehler um ein Feld. Das Feld bekommt die id automatisch, wenn es keine hat.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.hint]   kleiner grauer Text darunter
 * @param {string} [props.error]  ersetzt den Hinweis und färbt rot
 * @param {React.ReactElement} props.children  genau ein Input/Select/Textarea
 */
export function Field({ label, hint, error, className = "", children }) {
  const autoId = useId();
  const child = React.Children.only(children);
  const id = child.props.id || autoId;
  const noteId = `${id}-note`;
  const note = error || hint;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-white/70">{label}</label>
      {React.cloneElement(child, {
        id,
        "aria-invalid": error ? true : child.props["aria-invalid"],
        "aria-describedby": note ? noteId : child.props["aria-describedby"],
      })}
      {note && (
        <p id={noteId} className={`text-xs ${error ? "text-red-300" : "text-white/45"}`}>{note}</p>
      )}
    </div>
  );
}
