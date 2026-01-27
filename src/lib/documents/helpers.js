import { getDocumentsRepo } from "../repo/getDocumentsRepo";
import { saveDocument } from "../sync/syncManager";

export async function createDocument(type, title, additionalFields = {}) {
  const id = crypto.randomUUID();
  const doc = {
    id,
    type,
    title,
    ...additionalFields,
  };
  const content = type === "note" || type === "project" ? "" : undefined;
  await saveDocument(doc, content);
  return id;
}

export async function getDocumentsByType(type, filters) {
  const repo = getDocumentsRepo();
  const documents = await repo.list({ type, includeArchived: true, includeTrashed: true });
  if (!filters) return documents;

  const fullDocs = await Promise.all(documents.map((doc) => repo.get(doc.id)));
  return fullDocs.filter((doc) => {
    if (!doc) return false;
    return Object.entries(filters).every(([key, value]) => doc[key] === value);
  });
}

export async function getIncompleteTasks() {
  const repo = getDocumentsRepo();
  const tasks = await repo.list({ type: "task", includeArchived: true, includeTrashed: true });
  const fullDocs = await Promise.all(tasks.map((doc) => repo.get(doc.id)));
  return fullDocs.filter((doc) => doc && doc.completed === false).sort((a, b) => {
    const aDue = Date.parse(a.due_date || "") || 0;
    const bDue = Date.parse(b.due_date || "") || 0;
    return aDue - bDue;
  });
}

export async function getActiveProjects() {
  const repo = getDocumentsRepo();
  const projects = await repo.list({ type: "project", includeArchived: true, includeTrashed: true });
  const fullDocs = await Promise.all(projects.map((doc) => repo.get(doc.id)));
  return fullDocs.filter((doc) => doc && doc.status === "active").sort((a, b) => {
    const aTitle = (a.title || "").toLowerCase();
    const bTitle = (b.title || "").toLowerCase();
    return aTitle.localeCompare(bTitle);
  });
}

export async function getRecentNotes(limit = 10) {
  const repo = getDocumentsRepo();
  const notes = await repo.list({ type: "note", includeArchived: true, includeTrashed: true, limit: 200 });
  const fullDocs = await Promise.all(notes.map((doc) => repo.get(doc.id)));
  return fullDocs
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit);
}

export async function getTimeEntries(startDate, endDate) {
  const repo = getDocumentsRepo();
  const entries = await repo.list({ type: "time_entry", includeArchived: true, includeTrashed: true });
  const fullDocs = await Promise.all(entries.map((doc) => repo.get(doc.id)));
  return fullDocs.filter((doc) => {
    if (!doc || !doc.start_time) return false;
    return doc.start_time >= startDate && doc.start_time <= endDate;
  });
}

export async function completeTask(taskId) {
  const repo = getDocumentsRepo();
  const task = await repo.get(taskId);
  if (!task || task.type !== "task") return;

  await saveDocument({
    ...task,
    completed: true,
    completed_at: new Date().toISOString(),
  });
}

export async function logHabitCompletion(habitId, date) {
  const repo = getDocumentsRepo();
  const habit = await repo.get(habitId);
  if (!habit || habit.type !== "habit") return;

  const completions = Array.isArray(habit.completions) ? habit.completions : [];
  if (!completions.includes(date)) {
    completions.push(date);
    completions.sort();

    await saveDocument({
      ...habit,
      completions,
    });
  }
}

export async function startTimeEntry(title, taskId) {
  return createDocument("time_entry", title, {
    task_id: taskId || null,
    start_time: new Date().toISOString(),
    end_time: null,
    duration: null,
  });
}

export async function stopTimeEntry(entryId) {
  const repo = getDocumentsRepo();
  const entry = await repo.get(entryId);
  if (!entry || entry.type !== "time_entry") return;

  const endTime = new Date();
  const startTime = new Date(entry.start_time);
  const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

  await saveDocument({
    ...entry,
    end_time: endTime.toISOString(),
    duration,
  });
}
