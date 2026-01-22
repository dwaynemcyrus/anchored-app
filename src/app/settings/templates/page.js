"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getTemplates, resetBuiltInTemplate, createTemplateScaffold } from "../../../lib/templates";
import { getDocumentsRepo } from "../../../lib/repo/getDocumentsRepo";
import styles from "../../../styles/settings.module.css";

/**
 * Group templates by built-in status, then by templateFor
 */
function groupTemplates(templates) {
  const builtIn = [];
  const custom = [];

  for (const template of templates) {
    if (template.isBuiltIn) {
      builtIn.push(template);
    } else {
      custom.push(template);
    }
  }

  // Sort by templateFor, then by subtype
  const sortFn = (a, b) => {
    if (a.templateFor !== b.templateFor) {
      return a.templateFor.localeCompare(b.templateFor);
    }
    if (!a.templateForSubtype && b.templateForSubtype) return -1;
    if (a.templateForSubtype && !b.templateForSubtype) return 1;
    return (a.templateForSubtype || "").localeCompare(b.templateForSubtype || "");
  };

  builtIn.sort(sortFn);
  custom.sort(sortFn);

  return { builtIn, custom };
}

/**
 * Get display name for a template
 */
function getTemplateName(template) {
  if (template.title) return template.title;
  const baseName = template.templateFor.charAt(0).toUpperCase() + template.templateFor.slice(1);
  if (template.templateForSubtype) {
    return `${baseName} / ${template.templateForSubtype}`;
  }
  return baseName;
}

/**
 * Get type label for a template
 */
function getTypeLabel(template) {
  const base = template.templateFor;
  if (template.templateForSubtype) {
    return `${base} / ${template.templateForSubtype}`;
  }
  return base;
}

export default function ManageTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [message, setMessage] = useState(null);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await getTemplates();
      setTemplates(loaded);
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleEdit = (template) => {
    router.push(`/knowledge/notes/${template.id}`);
  };

  const handleReset = async (template) => {
    if (actionInProgress) return;

    const confirmed = window.confirm(
      `Reset "${getTemplateName(template)}" to its default? Your customizations will be lost.`
    );
    if (!confirmed) return;

    setActionInProgress(template.id);
    try {
      await resetBuiltInTemplate(template.id);
      await loadTemplates();
      showMessage("Template reset successfully");
    } catch (error) {
      console.error("Failed to reset template:", error);
      showMessage("Failed to reset template");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (template) => {
    if (actionInProgress) return;

    const confirmed = window.confirm(
      `Delete "${getTemplateName(template)}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setActionInProgress(template.id);
    try {
      const repo = getDocumentsRepo();
      await repo.delete(template.id);
      await loadTemplates();
      showMessage("Template deleted");
    } catch (error) {
      console.error("Failed to delete template:", error);
      showMessage("Failed to delete template");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreate = async () => {
    if (actionInProgress) return;

    setActionInProgress("creating");
    try {
      const template = await createTemplateScaffold();
      router.push(`/knowledge/notes/${template.id}`);
    } catch (error) {
      console.error("Failed to create template:", error);
      showMessage("Failed to create template");
      setActionInProgress(null);
    }
  };

  const { builtIn, custom } = groupTemplates(templates);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <button
            className={styles.backButton}
            onClick={() => router.back()}
            aria-label="Go back"
          >
            &larr;
          </button>
          <h1 className={styles.title}>Manage Templates</h1>
          <button
            type="button"
            className={`${styles.primaryButton} ${styles.headerAction}`}
            onClick={handleCreate}
            disabled={actionInProgress === "creating"}
          >
            {actionInProgress === "creating" ? "Creating..." : "Create"}
          </button>
        </header>

        {message && <p className={styles.message}>{message}</p>}

        {isLoading ? (
          <p className={styles.message}>Loading templates...</p>
        ) : (
          <>
            {builtIn.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Built-in</h2>
                <div className={styles.card}>
                  {builtIn.map((template) => (
                    <div key={template.id} className={styles.cardItem}>
                      <div className={styles.cardItemContent}>
                        <span className={styles.cardItemTitle}>
                          {getTemplateName(template)}
                        </span>
                        <span className={styles.cardItemDescription}>
                          {getTypeLabel(template)}
                        </span>
                      </div>
                      <div className={styles.cardItemActions}>
                        <button
                          type="button"
                          className={styles.actionButtonSmall}
                          onClick={() => handleEdit(template)}
                          disabled={actionInProgress === template.id}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.actionButtonSmall}
                          onClick={() => handleReset(template)}
                          disabled={actionInProgress === template.id}
                        >
                          {actionInProgress === template.id ? "..." : "Reset"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {custom.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Custom</h2>
                <div className={styles.card}>
                  {custom.map((template) => (
                    <div key={template.id} className={styles.cardItem}>
                      <div className={styles.cardItemContent}>
                        <span className={styles.cardItemTitle}>
                          {getTemplateName(template)}
                        </span>
                        <span className={styles.cardItemDescription}>
                          {getTypeLabel(template)}
                        </span>
                      </div>
                      <div className={styles.cardItemActions}>
                        <button
                          type="button"
                          className={styles.actionButtonSmall}
                          onClick={() => handleEdit(template)}
                          disabled={actionInProgress === template.id}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.actionButtonSmallDanger}
                          onClick={() => handleDelete(template)}
                          disabled={actionInProgress === template.id}
                        >
                          {actionInProgress === template.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {builtIn.length === 0 && custom.length === 0 && (
              <p className={styles.message}>No templates found.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
