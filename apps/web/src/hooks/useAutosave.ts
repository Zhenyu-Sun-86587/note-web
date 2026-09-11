import { useState, useEffect, useRef, useCallback } from "react";
import type { SaveStatus, NoteDocument } from "../api/types";
import { saveNote, ClientError } from "../api/client";

interface UseAutosaveOptions {
  path: string | null;
  content: string;
  revision: string | null;
  enabled: boolean;
  onSaved?: (doc: NoteDocument) => void;
  onConflict?: (err: ClientError) => void;
  onError?: (err: Error) => void;
}

export function useAutosave({
  path,
  content,
  revision,
  enabled,
  onSaved,
  onConflict,
  onError,
}: UseAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const conflictRef = useRef(false);

  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  const latestRevisionRef = useRef(revision);
  const latestPathRef = useRef(path);

  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const savingContentRef = useRef<string | null>(null);
  const saveAgainRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  latestPathRef.current = path;

  // Synchronize revision prop into ref whenever no save is currently in flight
  if (!inFlightPromiseRef.current) {
    latestRevisionRef.current = revision;
  }

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const updateStatus = useCallback((newStatus: SaveStatus) => {
    if (newStatus === "conflict") {
      conflictRef.current = true;
      saveAgainRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    } else if (conflictRef.current) {
      return;
    }
    setStatus(newStatus);
  }, []);

  const performSave = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (conflictRef.current) {
      return false;
    }

    const currentPath = latestPathRef.current;
    const currentRevision = latestRevisionRef.current;

    if (!currentPath || currentRevision === null) {
      return false;
    }

    if (inFlightPromiseRef.current) {
      if (latestContentRef.current !== savingContentRef.current) {
        saveAgainRef.current = true;
      }
      return inFlightPromiseRef.current;
    }

    updateStatus("saving");

    const savePromise = (async () => {
      try {
        let shouldLoop = true;
        let lastResult = true;

        while (shouldLoop) {
          if (conflictRef.current) {
            lastResult = false;
            break;
          }
          shouldLoop = false;
          saveAgainRef.current = false;
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }

          const p = latestPathRef.current;
          const c = latestContentRef.current;
          const r = latestRevisionRef.current;

          if (!p || r === null) {
            lastResult = false;
            break;
          }

          savingContentRef.current = c;
          const doc = await saveNote(p, c, r);
          if (conflictRef.current) {
            lastResult = false;
            break;
          }
          latestRevisionRef.current = doc.revision;
          updateStatus("saved");
          onSavedRef.current?.(doc);

          if (
            saveAgainRef.current &&
            latestContentRef.current !== savingContentRef.current
          ) {
            shouldLoop = true;
          }
        }
        return lastResult;
      } catch (err: unknown) {
        saveAgainRef.current = false;

        if (err instanceof ClientError && err.statusCode === 409) {
          updateStatus("conflict");
          onConflictRef.current?.(err);
        } else {
          updateStatus("error");
          onErrorRef.current?.(err as Error);
        }
        return false;
      } finally {
        savingContentRef.current = null;
        inFlightPromiseRef.current = null;
      }
    })();

    inFlightPromiseRef.current = savePromise;
    return savePromise;
  }, [updateStatus]);

  // Debounced auto-save effect
  useEffect(() => {
    if (
      !enabled ||
      conflictRef.current ||
      !path ||
      revision === null ||
      content === savingContentRef.current
    ) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    updateStatus("dirty");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (
        !conflictRef.current &&
        latestContentRef.current !== savingContentRef.current
      ) {
        performSave();
      }
    }, 1200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content, enabled, path, revision, performSave, updateStatus]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (conflictRef.current) {
      return false;
    }
    if (inFlightPromiseRef.current) {
      if (latestContentRef.current !== savingContentRef.current) {
        saveAgainRef.current = true;
      }
      return inFlightPromiseRef.current;
    }
    return performSave();
  }, [performSave]);

  const resetStatus = useCallback((newStatus: SaveStatus = "idle") => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    saveAgainRef.current = false;
    if (!inFlightPromiseRef.current) {
      savingContentRef.current = null;
    }
    conflictRef.current = newStatus === "conflict";
    setStatus(newStatus);
  }, []);

  return {
    status,
    saveNow,
    flush: saveNow,
    resetStatus,
    setStatus: updateStatus,
  };
}
