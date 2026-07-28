import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  useNotePreview,
  useNotePreviews,
  type NotePreviewSource,
} from "./useNotePreviews";

type Reader = (relativePath: string) => Promise<{ content: string }>;

/// Renders one row per source and counts how often each one renders, which is
/// the thing that actually mattered: a preview arriving must not re-render the
/// rest of the list.
function Row({
  previews,
  source,
  renders,
}: {
  previews: ReturnType<typeof useNotePreviews>;
  source: NotePreviewSource;
  renders: Map<string, number>;
}) {
  const preview = useNotePreview(previews, source);
  renders.set(source.relativePath, (renders.get(source.relativePath) ?? 0) + 1);
  return <li data-testid={source.relativePath}>{preview ?? "— unread"}</li>;
}

function List({
  read,
  sources,
  renders,
}: {
  read: Reader;
  sources: NotePreviewSource[];
  renders: Map<string, number>;
}) {
  const previews = useNotePreviews(read, true);
  return (
    <ul>
      {sources.map((source) => (
        <Row
          key={source.relativePath}
          previews={previews}
          renders={renders}
          source={source}
        />
      ))}
    </ul>
  );
}

function sources(count: number): NotePreviewSource[] {
  return Array.from({ length: count }, (_, index) => ({
    modifiedMillis: 1,
    relativePath: `Notes/Note ${index}.md`,
  }));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("note previews", () => {
  it("reads a visible note and shows its first line as the excerpt", async () => {
    const read = vi.fn(async () => ({
      content: "---\ntitle: Harbor\n---\n# Harbor\n\nA calm system.\n",
    }));
    render(<List read={read} renders={new Map()} sources={sources(1)} />);

    await settle();

    expect(screen.getByTestId("Notes/Note 0.md")).toHaveTextContent(
      "Harbor A calm system.",
    );
  });

  it("reads each note once, however often its row renders", async () => {
    const read = vi.fn(async () => ({ content: "Body\n" }));
    const renders = new Map<string, number>();
    const { rerender } = render(
      <List read={read} renders={renders} sources={sources(3)} />,
    );
    await settle();

    rerender(<List read={read} renders={renders} sources={sources(3)} />);
    await settle();

    expect(read).toHaveBeenCalledTimes(3);
  });

  it("re-renders only the row whose excerpt arrived", async () => {
    let release: ((value: { content: string }) => void) | undefined;
    const read = vi.fn(
      (relativePath: string) =>
        new Promise<{ content: string }>((resolve) => {
          if (relativePath === "Notes/Note 0.md") release = resolve;
          else resolve({ content: "Other\n" });
        }),
    );
    const renders = new Map<string, number>();
    render(<List read={read} renders={renders} sources={sources(3)} />);
    await settle();

    const before = new Map(renders);
    await act(async () => {
      release?.({ content: "Late arrival\n" });
      await Promise.resolve();
    });

    expect(renders.get("Notes/Note 0.md")).toBe(
      (before.get("Notes/Note 0.md") ?? 0) + 1,
    );
    expect(renders.get("Notes/Note 1.md")).toBe(before.get("Notes/Note 1.md"));
    expect(renders.get("Notes/Note 2.md")).toBe(before.get("Notes/Note 2.md"));
  });

  it("keeps only a handful of reads in flight at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const pending: (() => void)[] = [];
    const read = vi.fn(
      () =>
        new Promise<{ content: string }>((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          pending.push(() => {
            inFlight -= 1;
            resolve({ content: "Body\n" });
          });
        }),
    );
    render(<List read={read} renders={new Map()} sources={sources(60)} />);

    await settle();

    expect(peak).toBeLessThanOrEqual(6);
    expect(read.mock.calls.length).toBeLessThanOrEqual(6);
    await act(async () => {
      for (const resolve of pending.splice(0)) resolve();
      await Promise.resolve();
    });
  });

  it("does not read a note whose row went away before its turn", async () => {
    const pending: (() => void)[] = [];
    const read = vi.fn(
      () =>
        new Promise<{ content: string }>((resolve) => {
          pending.push(() => resolve({ content: "Body\n" }));
        }),
    );

    function Scrolling() {
      const [visible, setVisible] = useState(sources(60));
      return (
        <>
          <button onClick={() => setVisible(sources(60).slice(0, 6))}>
            scroll
          </button>
          <List read={read} renders={new Map()} sources={visible} />
        </>
      );
    }

    render(<Scrolling />);
    await settle();
    // The rows past the first handful never got their turn, and are gone.
    await act(async () => {
      screen.getByText("scroll").click();
    });
    await act(async () => {
      for (const resolve of pending.splice(0)) resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Six reads started before the queue was drained; nothing beyond the rows
    // that survived may be read afterwards.
    expect(read.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("reads nothing while no vault is open", async () => {
    const read = vi.fn(async () => ({ content: "Body\n" }));

    function Closed() {
      const previews = useNotePreviews(read, false);
      return (
        <Row previews={previews} renders={new Map()} source={sources(1)[0]} />
      );
    }
    render(<Closed />);
    await settle();

    expect(read).not.toHaveBeenCalled();
  });
});
