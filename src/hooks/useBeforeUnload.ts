"use client";

import { useEffect } from "react";

export function useBeforeUnload(enabled: boolean, message?: string): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue =
        message ??
        "Nothing is saved. Copy your notes before leaving.";
      return event.returnValue;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled, message]);
}
