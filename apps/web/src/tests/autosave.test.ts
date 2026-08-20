import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosave } from "../hooks/useAutosave";
import * as client from "../api/client";

vi.mock("../api/client", () => ({
  saveNote: vi.fn(),
  ClientError: class ClientError extends Error {
    constructor(
      public code: string,
      message: string,
      public statusCode: number,
      public currentRevision?: string,
    ) {
      super(message);
      this.name = "ClientError";
    }
  },
}));

describe("useAutosave hook", () => {
  it("does not auto-save when enabled is false (clean content)", async () => {
    vi.useFakeTimers();
    const saveNoteMock = vi.mocked(client.saveNote);
    const onSaved = vi.fn();

    renderHook(
      (props) =>
        useAutosave({
          path: props.path,
          content: props.content,
          revision: props.revision,
          enabled: props.enabled,
          onSaved,
        }),
      {
        initialProps: {
          path: "inbox/test.md",
          content: "Content A",
          revision: "rev-1",
          enabled: false,
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(saveNoteMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("debounces 1200ms and calls saveNote once, and does not loop after onSaved updates", async () => {
    vi.useFakeTimers();
    const saveNoteMock = vi.mocked(client.saveNote);
    saveNoteMock.mockResolvedValue({
      path: "inbox/test.md",
      content: "Content B",
      revision: "rev-2",
      modifiedAt: "2026-08-20T12:00:00.000Z",
      size: 9,
    });

    let currentOpenNote = {
      path: "inbox/test.md",
      content: "Content A",
      revision: "rev-1",
    };
    let draftContent = "Content A";

    const onSaved = vi.fn((doc) => {
      currentOpenNote = {
        path: doc.path,
        content: doc.content,
        revision: doc.revision,
      };
    });

    const { result, rerender } = renderHook(
      (props) =>
        useAutosave({
          path: props.openNote.path,
          content: props.draft,
          revision: props.openNote.revision,
          enabled: props.openNote.content !== props.draft,
          onSaved,
        }),
      {
        initialProps: {
          openNote: currentOpenNote,
          draft: draftContent,
        },
      },
    );

    expect(result.current.status).toBe("idle");

    // User edits content to "Content B"
    draftContent = "Content B";
    rerender({
      openNote: currentOpenNote,
      draft: draftContent,
    });

    expect(result.current.status).toBe("dirty");

    // Advance timer by 1200ms to trigger save
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(saveNoteMock).toHaveBeenCalledTimes(1);
    expect(saveNoteMock).toHaveBeenCalledWith(
      "inbox/test.md",
      "Content B",
      "rev-1",
    );
    expect(onSaved).toHaveBeenCalledTimes(1);

    // After save, onSaved updated currentOpenNote to Content B with rev-2
    rerender({
      openNote: currentOpenNote,
      draft: draftContent,
    });

    // Advance timer further into the future
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Must NOT call saveNote again
    expect(saveNoteMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("saveNow awaits in-flight save and handles sequential updates", async () => {
    const saveNoteMock = vi.mocked(client.saveNote);
    saveNoteMock
      .mockResolvedValueOnce({
        path: "inbox/test.md",
        content: "Content B",
        revision: "rev-2",
        modifiedAt: "2026-08-20T12:00:30.000Z",
        size: 9,
      })
      .mockResolvedValueOnce({
        path: "inbox/test.md",
        content: "Content C",
        revision: "rev-3",
        modifiedAt: "2026-08-20T12:01:00.000Z",
        size: 9,
      });

    let currentOpenNote = {
      path: "inbox/test.md",
      content: "Content A",
      revision: "rev-1",
    };

    const onSaved = vi.fn((doc) => {
      currentOpenNote = {
        path: doc.path,
        content: doc.content,
        revision: doc.revision,
      };
    });

    const { result, rerender } = renderHook(
      (props) =>
        useAutosave({
          path: props.openNote.path,
          content: props.draft,
          revision: props.openNote.revision,
          enabled: props.openNote.content !== props.draft,
          onSaved,
        }),
      {
        initialProps: {
          openNote: currentOpenNote,
          draft: "Content B",
        },
      },
    );

    await act(async () => {
      const p1 = result.current.saveNow();
      rerender({
        openNote: currentOpenNote,
        draft: "Content C",
      });
      const p2 = result.current.saveNow();
      await Promise.all([p1, p2]);
    });

    expect(saveNoteMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onSaved).toHaveBeenCalled();
  });
});
