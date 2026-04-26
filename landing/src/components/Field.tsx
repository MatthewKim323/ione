import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

/**
 * Form input styled like writing on ruled paper. Underline-only border
 * (no rounded box) so it reads as "filling in a blank" instead of a generic
 * web form field.
 */
export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="mb-5">
      <label
        htmlFor={inputId}
        className="block font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute mb-2"
      >
        {label}
      </label>
      <input
        id={inputId}
        {...rest}
        className={`w-full bg-transparent border-0 border-b border-paper-faint focus:border-red-pencil focus:outline-none px-0 py-2 text-paper placeholder:text-paper-faint font-sub text-sm transition-colors ${rest.className ?? ""}`}
      />
      {hint && !error && (
        <p className="mt-1.5 font-sub text-[10px] tracking-wide text-paper-mute">
          {hint}
        </p>
      )}
      {error && (
        <p className="mt-1.5 font-sub text-[10px] tracking-wide text-red-pencil">
          {error}
        </p>
      )}
    </div>
  );
}
