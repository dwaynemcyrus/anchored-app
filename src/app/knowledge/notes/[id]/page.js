import NoteEditor from "../../../../components/notes/NoteEditor";

export default async function NoteEditorPage({ params }) {
  const { id } = await params;
  return <NoteEditor noteId={id} />;
}
