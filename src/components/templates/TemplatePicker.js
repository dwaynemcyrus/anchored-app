"use client";

import { useCallback, useEffect, useState } from "react";
import { getTemplates, createFromTemplate } from "../../lib/templates";
import styles from "./TemplatePicker.module.css";

/**
 * Group templates by type, then subtype
 * @param {import('../../lib/templates/types.js').Template[]} templates
 * @returns {Map<string, import('../../lib/templates/types.js').Template[]>}
 */
function groupTemplates(templates) {
  const groups = new Map();

  // Sort: built-in first, then by templateFor, then by subtype
  const sorted = [...templates].sort((a, b) => {
    // Built-in first
    if (a.isBuiltIn && !b.isBuiltIn) return -1;
    if (!a.isBuiltIn && b.isBuiltIn) return 1;

    // Then by templateFor
    if (a.templateFor !== b.templateFor) {
      return a.templateFor.localeCompare(b.templateFor);
    }

    // Base templates (no subtype) before subtypes
    if (!a.templateForSubtype && b.templateForSubtype) return -1;
    if (a.templateForSubtype && !b.templateForSubtype) return 1;

    // Then by subtype
    return (a.templateForSubtype || "").localeCompare(b.templateForSubtype || "");
  });

  for (const template of sorted) {
    const groupKey = template.templateFor;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(template);
  }

  return groups;
}

/**
 * Get display name for a template
 * @param {import('../../lib/templates/types.js').Template} template
 * @returns {string}
 */
function getTemplateName(template) {
  if (template.title) return template.title;
  const baseName = template.templateFor.charAt(0).toUpperCase() + template.templateFor.slice(1);
  if (template.templateForSubtype) {
    return `${baseName} (${template.templateForSubtype})`;
  }
  return baseName;
}

/**
 * Template picker modal for document creation or insertion
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onSelect - Called with document (create mode) or template (insert mode)
 * @param {Function} props.onCancel
 * @param {'create' | 'insert'} [props.mode='create'] - "create" creates new document, "insert" returns template
 */
export default function TemplatePicker({ isOpen, onSelect, onCancel, mode = "create" }) {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTemplates([]);
      setIsLoading(true);
      return;
    }

    async function loadTemplates() {
      setIsLoading(true);
      try {
        const loaded = await getTemplates();
        setTemplates(loaded);
      } catch (error) {
        console.error("Failed to load templates:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadTemplates();
  }, [isOpen]);

  const handleSelect = useCallback(
    async (template) => {
      if (isCreating) return;

      // Insert mode: just return the template for caller to handle
      if (mode === "insert") {
        onSelect?.(template);
        return;
      }

      // Create mode: create a new document from template
      setIsCreating(true);
      try {
        const doc = await createFromTemplate(template.id);
        if (doc) {
          onSelect?.(doc);
        }
      } catch (error) {
        console.error("Failed to create document:", error);
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, onSelect, mode]
  );

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) {
        onCancel?.();
      }
    },
    [onCancel]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        onCancel?.();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const grouped = groupTemplates(templates);

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {mode === "insert" ? "Insert Template" : "New Document"}
          </h2>
          <button
            className={styles.closeButton}
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className={styles.empty}>No templates available</div>
          ) : (
            <div className={styles.templateList}>
              {Array.from(grouped.entries()).map(([groupKey, groupTemplates]) => (
                <div key={groupKey} className={styles.group}>
                  <div className={styles.groupHeader}>
                    {groupKey.charAt(0).toUpperCase() + groupKey.slice(1)}
                  </div>
                  <div className={styles.groupItems}>
                    {groupTemplates.map((template) => (
                      <button
                        key={template.id}
                        className={styles.templateItem}
                        onClick={() => handleSelect(template)}
                        disabled={isCreating}
                      >
                        <span className={styles.templateName}>
                          {getTemplateName(template)}
                        </span>
                        {template.templateForSubtype && (
                          <span className={styles.templateSubtype}>
                            {template.templateForSubtype}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
