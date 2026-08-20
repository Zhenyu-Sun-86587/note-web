import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not auto-save when enabled is false (clean content)", async () => {
    const saveNoteMock = vi.mocked(client.saveNote);
    const onSaved = vi.fn();

    renderHook(() =>
      useAutosave({
        path: "inbox/test.md",
        content: "Content A",
        revision: "rev-1",
        enabled: false,
        onSaved,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(saveNoteMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("debounces 1200ms and calls saveNote once, and does not loop after onSaved updates", async () => {
    const saveNoteMock = vi.mocked(client.saveNote);
    saveNoteMock.mockReset();
    saveNoteMock.mockResolvedValue({
      path: "inbox/test.md",
      content: "Content B",
      revision: "rev-2",
      modifiedAt: "2026-08-20T12:00:00.000Z",
      size: 9,
    });

    const { result } = renderHook(() => {
      const [openNote, setOpenNote] = useState({
        path: "inbox/test.md",
        content: "Content A",
        revision: "rev-1",
      });
      const [draft, setDraft] = useState("Content A");
      const isDirty = openNote.content !== draft;

      const autosave = useAutosave({
        path: openNote.path,
        content: draft,
        revision: openNote.revision,
        enabled: isDirty,
        onSaved: (doc) => {
          setOpenNote({
            path: doc.path,
            content: doc.content,
            revision: doc.revision,
          });
        },
      });

      return { autosave, setDraft };
    });

    expect(result.current.autosave.status).toBe("idle");

    // User edits content to "Content B"
    act(() => {
      result.current.setDraft("Content B");
    });

    expect(result.current.autosave.status).toBe("dirty");

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

    // Advance timer further into the future
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Must NOT call saveNote again
    expect(saveNoteMock).toHaveBeenCalledTimes(1);
  });

  it("sequential saves use returned new revision for subsequent save", async () => {
    let resolveFirstSave: (val: any) => void;
    const firstSavePromise = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });

    const saveNoteMock = vi.mocked(client.saveNote);
    saveNoteMock.mockReset();
    saveNoteMock
      .mockImplementationOnce(() => firstSavePromise as any)
      .mockResolvedValueOnce({
        path: "inbox/test.md",
        content: "Content C",
        revision: "rev-3",
        modifiedAt: "2026-08-20T12:01:00.000Z",
        size: 9,
      });

    const { result } = renderHook(() => {
      const [openNote, setOpenNote] = useState({
        path: "inbox/test.md",
        content: "Content A",
        revision: "rev-1",
      });
      const [draft, setDraft] = useState("Content A");
      const isDirty = openNote.content !== draft;

      const autosave = useAutosave({
        path: openNote.path,
        content: draft,
        revision: openNote.revision,
        enabled: isDirty,
        onSaved: (doc) => {
          setOpenNote({
            path: doc.path,
            content: doc.content,
            revision: doc.revision,
          });
        },
      });

      return { autosave, setDraft };
    });

    let savePromise: Promise<boolean>;
    // 1. User changes draft to Content B and saveNow starts
    act(() => {
      result.current.setDraft("Content B");
    });
    act(() => {
      savePromise = result.current.autosave.saveNow();
    });

    // 2. While in flight, user changes draft to Content C and saveNow is queued
    act(() => {
      result.current.setDraft("Content C");
    });
    act(() => {
      result.current.autosave.saveNow();
    });

    // 3. Resolve first save
    act(() => {
      resolveFirstSave!({
        path: "inbox/test.md",
        content: "Content B",
        revision: "rev-2",
        modifiedAt: "2026-08-20T12:00:30.000Z",
        size: 9,
      });
    });

    await act(async () => {
      await savePromise;
    });

    expect(saveNoteMock).toHaveBeenCalledTimes(2);
    expect(saveNoteMock).toHaveBeenNthCalledWith(
      1,
      "inbox/test.md",
      "Content B",
      "rev-1",
    );
    expect(saveNoteMock).toHaveBeenNthCalledWith(
      2,
      "inbox/test.md",
      "Content C",
      "rev-2",
    );
  });
});
