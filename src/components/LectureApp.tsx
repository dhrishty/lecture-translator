"use client";
import dynamic from "next/dynamic";
const LectureWorkspace = dynamic(() => import("./LectureWorkspace"), { ssr: false, loading: () => <p className="loading">Opening HanYong…</p> });
export default function LectureApp() { return <LectureWorkspace />; }
