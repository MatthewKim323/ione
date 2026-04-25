interface SectionLabelProps {
  number: string; // "001"
  name: string; // "pedagogy"
}

export function SectionLabel({ number, name }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-3 section-label">
      <span className="text-paper-faint">©</span>
      <span className="text-paper-dim">ione</span>
      <span className="text-paper-faint">—</span>
      <span className="text-paper">{number}</span>
      <span className="text-paper-faint">/</span>
      <span className="text-red-pencil">{name}</span>
    </div>
  );
}
