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

  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  const latestRevisionRef = useRef(revision);
  latestRevisionRef.current = revision;

  const latestPathRef = useRef(path);
  latestPathRef.current = path;

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const saveAgainRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const performSave = useCallback(async (): Promise<boolean> => {
    const currentPath = latestPathRef.current;
    const currentRevision = latestRevisionRef.current;

    if (!currentPath || currentRevision === null) {
      return false;
    }

    if (inFlightPromiseRef.current) {
      saveAgainRef.current = true;
      return inFlightPromiseRef.current;
    }

    setStatus("saving");

    const savePromise = (async () => {
      try {
        let shouldLoop = true;
        let lastResult = true;

        while (shouldLoop) {
          shouldLoop = false;
          saveAgainRef.current = false;

          const p = latestPathRef.current;
          const c = latestContentRef.current;
          const r = latestRevisionRef.current;

          if (!p || r === null) {
            lastResult = false;
            break;
          }

          const doc = await saveNote(p, c, r);
          setStatus("saved");
          onSavedRef.current?.(doc);

          if (saveAgainRef.current) {
            shouldLoop = true;
          }
        }
        return lastResult;
      } catch (err: unknown) {
        saveAgainRef.current = false;

        if (err instanceof ClientError && err.statusCode === 409) {
          setStatus("conflict");
          onConflictRef.current?.(err);
        } else {
          setStatus("error");
          onErrorRef.current?.(err as Error);
        }
        return false;
      } finally {
        inFlightPromiseRef.current = null;
      }
    })();

    inFlightPromiseRef.current = savePromise;
    return savePromise;
  }, []);

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled || !path || revision === null) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    setStatus((prev) => (prev === "conflict" ? "conflict" : "dirty"));

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave();
    }, 1200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content, enabled, path, revision, performSave]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (inFlightPromiseRef.current) {
      saveAgainRef.current = true;
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
    setStatus(newStatus);
  }, []);

  return {
    status,
    saveNow,
    flush: saveNow,
    resetStatus,
    setStatus,
  };
}
