import { Suspense } from "react";
import NotesList from "../../../components/notes/NotesList";

export default function NotesPage() {
  return (
    <Suspense fallback={null}>
      <NotesList />
    </Suspense>
  );
}
