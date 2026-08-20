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

  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const performSave = useCallback(async (): Promise<boolean> => {
    const currentPath = latestPathRef.current;
    const currentContent = latestContentRef.current;
    const currentRevision = latestRevisionRef.current;

    if (!currentPath || currentRevision === null) {
      return false;
    }

    if (savingRef.current) {
      saveAgainRef.current = true;
      return false;
    }

    savingRef.current = true;
    setStatus("saving");

    try {
      const doc = await saveNote(currentPath, currentContent, currentRevision);
      savingRef.current = false;
      setStatus("saved");
      onSaved?.(doc);

      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        return performSave();
      }
      return true;
    } catch (err: unknown) {
      savingRef.current = false;
      saveAgainRef.current = false;

      if (err instanceof ClientError && err.statusCode === 409) {
        setStatus("conflict");
        onConflict?.(err);
      } else {
        setStatus("error");
        onError?.(err as Error);
      }
      return false;
    }
  }, [onSaved, onConflict, onError]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled || !path || revision === null) {
      return;
    }

    if (status !== "conflict") {
      setStatus("dirty");
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (status === "conflict") {
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave();
    }, 1200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content, enabled, path, revision, performSave, status]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    return performSave();
  }, [performSave]);

  const resetStatus = useCallback((newStatus: SaveStatus = "idle") => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setStatus(newStatus);
  }, []);

  return {
    status,
    saveNow,
    resetStatus,
    setStatus,
  };
}
