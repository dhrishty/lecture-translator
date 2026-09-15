import { NotesEditor } from "./NotesEditor";
export function ManualNotes({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <section className="manual-notes"><div className="section-heading"><h2>Manual Notes</h2></div>
    <NotesEditor value={value} onChange={onChange} label="Manual Notes" />
  </section>;
}
