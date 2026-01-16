import NoteEditor from "../../../../components/notes/NoteEditor";

export default function NoteEditorPage({ params }) {
  return <NoteEditor noteId={params.id} />;
}
