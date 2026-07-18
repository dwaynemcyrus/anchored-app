import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef } from "react";

import "katex/dist/katex.min.css";

import { renderMarkdown } from "../markdown/renderer";
import type { MarkdownSettings } from "../markdown/types";

type MarkdownPreviewProps = {
  label: string;
  onOpenWikilink: (target: string) => void;
  settings: MarkdownSettings;
  source: string;
};

export default function MarkdownPreview({
  label,
  onOpenWikilink,
  settings,
  source,
}: MarkdownPreviewProps) {
  const hostRef = useRef<HTMLElement>(null);
  const rendered = useMemo(
    () => renderMarkdown(source, settings),
    [settings, source],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLElement>("[data-wikilink-target]");
      const wikilinkTarget = link?.dataset.wikilinkTarget;
      if (!wikilinkTarget) return;
      event.preventDefault();
      onOpenWikilink(wikilinkTarget);
    }

    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [onOpenWikilink]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !settings.mermaid) return;
    const diagrams = Array.from(
      host.querySelectorAll<HTMLElement>(".markdown-mermaid"),
    );
    if (diagrams.length === 0) return;

    let disposed = false;
    void import("mermaid").then(({ default: mermaid }) => {
      if (disposed) return;
      mermaid.initialize({
        securityLevel: "strict",
        startOnLoad: false,
        theme: "dark",
      });
      diagrams.forEach((diagram, index) => {
        const code = diagram.querySelector("code")?.textContent ?? "";
        const id = `anchored-mermaid-${index}-${Date.now()}`;
        void mermaid
          .render(id, code)
          .then(({ svg }) => {
            if (disposed) return;
            diagram.setAttribute("role", "img");
            diagram.setAttribute("aria-label", "Mermaid diagram");
            diagram.innerHTML = DOMPurify.sanitize(svg, {
              FORBID_TAGS: ["script"],
              USE_PROFILES: { svg: true, svgFilters: true },
            });
          })
          .catch(() => {
            diagram.setAttribute("role", "img");
            diagram.setAttribute("aria-label", "Mermaid diagram source");
          });
      });
    });

    return () => {
      disposed = true;
    };
  }, [rendered.html, settings.mermaid]);

  return (
    <article
      ref={hostRef}
      aria-label={label}
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
