"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecognitionMode } from "@/types/lecture";
import type { SpeechRecognitionInstance } from "@/types/speech";
export type SpeechStatus = "idle" | "listening" | "paused" | "reconnecting" | "unsupported" | "denied" | "error";

export function useSpeechRecognition({ onFinalResult, onStopped, onActivity }: {
  onFinalResult: (text: string, language: RecognitionMode) => void; onStopped: () => void; onActivity: () => void;
}) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [interimText, setInterimText] = useState("");
  const [errorMessage, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionInstance | null>(null);
  const desiredLanguage = useRef<RecognitionMode>("ko");
  const stopWaiters = useRef<Array<() => void>>([]);
  const listening = useRef(false);
  const running = useRef(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onFinalResult, onStopped, onActivity });
  useEffect(() => { callbacks.current = { onFinalResult, onStopped, onActivity }; }, [onFinalResult, onStopped, onActivity]);
  const isSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { setStatus("unsupported"); return; }
    if (listening.current || running.current) return;
    listening.current = true;
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    let networkFailures = 0;
    let restartDelay = 500;
    let finalIndices = new Set<number>();
    const instance = recognition.current ?? new Ctor();
    recognition.current = instance;
    let runLanguage = desiredLanguage.current;
    instance.continuous = true;
    instance.interimResults = true;
    const fail = (message: string) => {
      listening.current = false;
      setStatus("error"); setError(message);
      callbacks.current.onStopped();
    };
    const begin = () => {
      if (!listening.current) return;
      finalIndices = new Set();
      runLanguage = desiredLanguage.current;
      instance.lang = runLanguage === "en" ? "en-US" : "ko-KR";
      try { running.current = true; instance.start(); }
      catch { running.current = false; fail("Could not start the microphone. Try again."); }
    };
    instance.onstart = () => { setStatus("listening"); };
    instance.onresult = event => {
      networkFailures = 0; restartDelay = 500; setError(null);
      callbacks.current.onActivity();
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript.trim();
        if (result.isFinal && text && !finalIndices.has(i)) {
          finalIndices.add(i);
          callbacks.current.onFinalResult(text, runLanguage);
        } else if (!result.isFinal) interim += text ?? "";
      }
      setInterimText(interim);
    };
    instance.onerror = event => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "network" && listening.current && ++networkFailures <= 5) {
        restartDelay = Math.min(1000 * 2 ** (networkFailures - 1), 10000);
        setStatus("reconnecting");
        setError("Speech connection interrupted. Reconnecting automatically…");
        return;
      }
      fail(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission denied. Allow microphone access in Chrome’s site settings, then retry."
        : `Speech recognition stopped (${event.error}). Check your microphone and connection, then retry.`);
    };
    instance.onend = () => {
      running.current = false; setInterimText("");
      if (!listening.current) callbacks.current.onStopped();
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopWaiters.current.splice(0).forEach(resolve => resolve());
      if (!listening.current) return;
      setStatus("reconnecting");
      timer.current = setTimeout(begin, restartDelay);
    };
    begin();
  }, []);
  const pause = useCallback(() => {
    listening.current = false;
    if (timer.current) clearTimeout(timer.current);
    const stopped = new Promise<void>(resolve => {
      if (running.current) stopWaiters.current.push(resolve); else resolve();
    });
    if (running.current) {
      // A browser may never deliver onend after a device failure. Don't trap the review flow.
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => {
        if (!running.current) return;
        const instance = recognition.current;
        if (instance) {
          instance.onresult = null; instance.onend = null; instance.onstart = null; instance.onerror = null;
          instance.abort();
        }
        recognition.current = null;
        running.current = false;
        callbacks.current.onStopped();
        setError("The microphone did not stop normally. Finalized text is kept; unfinished speech may be missing.");
        stopWaiters.current.splice(0).forEach(resolve => resolve());
      }, 2500);
      try { recognition.current?.stop(); } catch {
        running.current = false;
        if (stopTimer.current) clearTimeout(stopTimer.current);
        stopWaiters.current.splice(0).forEach(resolve => resolve());
      }
    }
    setInterimText(""); setStatus("paused");
    callbacks.current.onStopped();
    return stopped;
  }, []);
  const changeLanguage = useCallback((language: RecognitionMode) => {
    desiredLanguage.current = language;
    callbacks.current.onStopped();
    if (running.current) recognition.current?.stop();
  }, []);
  useEffect(() => {
    const dispose = () => {
    listening.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    const instance = recognition.current;
    if (instance) {
      instance.onresult = null; instance.onend = null; instance.onstart = null; instance.onerror = null;
      instance.abort();
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopWaiters.current.splice(0).forEach(resolve => resolve());
    }
    };
    window.addEventListener("pagehide", dispose);
    return () => { window.removeEventListener("pagehide", dispose); dispose(); };
  }, []);
  return { status, interimText, errorMessage, isSupported, start, pause, changeLanguage, resume: start };
}
