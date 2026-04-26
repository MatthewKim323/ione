interface SectionLabelProps {
  number: string; // "001"
  name: string; // "pedagogy"
}

export function SectionLabel({ number, name }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-3 section-label">
      <span className="text-ink/35">©</span>
      <span className="text-ink/55">ione</span>
      <span className="text-ink/35">—</span>
      <span className="text-ink">{number}</span>
      <span className="text-ink/35">/</span>
      <span className="text-red-pencil">{name}</span>
    </div>
  );
}
