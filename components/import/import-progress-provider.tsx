"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ImportCommitResult, ImportItemStatus } from "@/features/imports/types";

const STORAGE_KEY = "amuwiki:active-import-job";
const POLL_INTERVAL_MS = 2000;
// The commit route's own maxDuration is 60s. A platform-level cutoff kills the
// connection outright (fetch rejects) rather than returning an HTTP response,
// so this client timeout only needs to be comfortably above that to distinguish
// "server responded" from "connection was cut" — it isn't a retry budget.
const COMMIT_FETCH_TIMEOUT_MS = 70_000;
const MAX_COMMIT_ATTEMPTS = 8;

export type ImportPhase = "idle" | "committing" | "done" | "error";

export type ImportProgressState = {
  jobId: string | null;
  phase: ImportPhase;
  counts: Record<ImportItemStatus, number> | null;
  total: number;
  attempt: number;
  message: string | null;
  result: ImportCommitResult | null;
  // Hides the global status bar without discarding jobId/result — the import
  // page (if still open) keeps showing its own "done"/"error" screen from this
  // same state, so dismissing the bar must not blow that view away too.
  dismissed: boolean;
};

const IDLE_STATE: ImportProgressState = {
  jobId: null,
  phase: "idle",
  counts: null,
  total: 0,
  attempt: 0,
  message: null,
  result: null,
  dismissed: false,
};

type ImportProgressContextValue = {
  state: ImportProgressState;
  startCommit: (jobId: string, conflictPolicy: "skip" | "rename") => void;
  dismiss: () => void;
};

const ImportProgressContext = createContext<ImportProgressContextValue | null>(null);

async function fetchJobStatus(jobId: string) {
  const response = await fetch(`/api/imports/${jobId}`);
  if (!response.ok) return null;
  return (await response.json()) as {
    counts: Record<ImportItemStatus, number>;
    total: number;
  };
}

function restoredInitialState(): ImportProgressState {
  if (typeof window === "undefined") return IDLE_STATE;
  try {
    const storedJobId = sessionStorage.getItem(STORAGE_KEY);
    if (!storedJobId) return IDLE_STATE;
    // Only restore visibility (jobId + phase) here; the poll effect below fetches
    // the actual counts once mounted. This does not resume posting commit — if the
    // job errored mid-flight, the user needs to reopen the import page to retry.
    return { ...IDLE_STATE, jobId: storedJobId, phase: "committing" };
  } catch {
    return IDLE_STATE;
  }
}

export function ImportProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImportProgressState>(restoredInitialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async (jobId: string) => {
    const status = await fetchJobStatus(jobId);
    if (!status) return;
    setState((prev) =>
      prev.jobId === jobId ? { ...prev, counts: status.counts, total: status.total } : prev,
    );
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => void pollOnce(jobId), POLL_INTERVAL_MS);
    },
    [pollOnce, stopPolling],
  );

  const runCommit = useCallback(
    async (jobId: string, conflictPolicy: "skip" | "rename") => {
      if (runningRef.current) return;
      runningRef.current = true;

      sessionStorage.setItem(STORAGE_KEY, jobId);
      setState({ ...IDLE_STATE, jobId, phase: "committing", attempt: 0 });
      startPolling(jobId);
      void pollOnce(jobId);

      let lastResult: ImportCommitResult | null = null;
      let attempt = 0;
      let stopped = false;

      while (!stopped && attempt < MAX_COMMIT_ATTEMPTS) {
        attempt += 1;
        setState((prev) => (prev.jobId === jobId ? { ...prev, attempt } : prev));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), COMMIT_FETCH_TIMEOUT_MS);
        try {
          const response = await fetch(`/api/imports/${jobId}/commit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conflictPolicy }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const payload = (await response.json().catch(() => null)) as
            | (ImportCommitResult & { message?: string })
            | null;

          if (!response.ok || !payload) {
            setState((prev) =>
              prev.jobId === jobId
                ? { ...prev, phase: "error", message: payload?.message ?? "가져오기에 실패했습니다." }
                : prev,
            );
            stopped = true;
            break;
          }

          // The commit route processes every item synchronously before responding
          // (it never returns early), so any successful response means it finished
          // the whole pass — this is the completion condition, not a partial update.
          lastResult = payload;
          stopped = true;
        } catch {
          clearTimeout(timeout);
          // fetch rejected: the platform cut the connection (maxDuration) rather than
          // the server sending an error — resume by re-posting commit. The commit
          // route skips items already marked imported/skipped, so this continues
          // rather than redoing finished work.
          if (attempt >= MAX_COMMIT_ATTEMPTS) {
            setState((prev) =>
              prev.jobId === jobId
                ? {
                    ...prev,
                    phase: "error",
                    message: `가져오기가 ${MAX_COMMIT_ATTEMPTS}번 시도 후에도 끝나지 않았습니다. 파일을 나눠서 다시 시도해주세요.`,
                  }
                : prev,
            );
            stopped = true;
          }
        }
      }

      stopPolling();
      if (lastResult) {
        void pollOnce(jobId);
        setState((prev) =>
          prev.jobId === jobId ? { ...prev, phase: "done", result: lastResult, attempt } : prev,
        );
        sessionStorage.removeItem(STORAGE_KEY);
      }
      runningRef.current = false;
    },
    [pollOnce, startPolling, stopPolling],
  );

  const startCommit = useCallback(
    (jobId: string, conflictPolicy: "skip" | "rename") => {
      void runCommit(jobId, conflictPolicy);
    },
    [runCommit],
  );

  const dismiss = useCallback(() => {
    stopPolling();
    sessionStorage.removeItem(STORAGE_KEY);
    setState((prev) => ({ ...prev, dismissed: true }));
  }, [stopPolling]);

  // Re-attach polling for a job restored from sessionStorage (see restoredInitialState).
  // pollOnce only calls setState from inside its own fetch().then callback, not
  // synchronously here, but the lint rule can't see through the indirection.
  useEffect(() => {
    if (!state.jobId || state.phase !== "committing") return;
    startPolling(state.jobId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState happens async, after await, inside pollOnce
    void pollOnce(state.jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  return (
    <ImportProgressContext.Provider value={{ state, startCommit, dismiss }}>
      {children}
    </ImportProgressContext.Provider>
  );
}

export function useImportProgress() {
  const context = useContext(ImportProgressContext);
  if (!context) throw new Error("useImportProgress must be used within ImportProgressProvider");
  return context;
}
