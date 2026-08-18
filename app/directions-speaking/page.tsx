"use client";

import { useEffect, useRef, useState } from "react";

const scenarios = [
  "You are at the post office. How do I get to the university?",
  "You are at the hotel. What's the way to the train station?",
  "You are at the department store. Where is the pet store located?",
  "You are at the clock tower. Is there a park near here?",
  "You are at the train station. How do I get to the factory?",
];

type Score = { score?: number; feedback_vi?: string };
type Result = {
  overall_score?: number;
  route_accuracy?: Score & { status?: string };
  grammar_vocabulary?: Score & { strengths?: string[]; corrections?: string[] };
  pronunciation?: Score & { provisional?: boolean };
  interactive_communication?: Score;
  global_achievement?: Score;
  corrected_answer?: string;
  model_answer?: string;
  next_step_vi?: string;
};

export default function DirectionsSpeaking() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "direction-scenario") {
        const index = Number(event.data.index);
        if (Number.isInteger(index) && index >= 0 && index < scenarios.length) {
          setScenarioIndex(index);
          setTranscript("");
          setResult(null);
          setError("");
        }
      }
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "directions-assessor-ready" }, "*");
    return () => window.removeEventListener("message", receive);
  }, []);

  async function sendAudio(blob: Blob) {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "directions.webm");
      form.append("scenarioIndex", String(scenarioIndex));
      const response = await fetch("/api/directions-speaking", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể chấm bài nói.");
      setTranscript(data.transcript || "");
      setResult(data.result || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể chấm bài nói.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        streamRef.current?.getTracks().forEach(track => track.stop());
        void sendAudio(blob);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Không mở được micro. Hãy cho phép trình duyệt sử dụng micro rồi thử lại.");
    }
  }

  const cards = result ? [
    ["Route accuracy", result.route_accuracy?.score],
    ["Grammar & Vocabulary", result.grammar_vocabulary?.score],
    ["Pronunciation*", result.pronunciation?.score],
    ["Interactive Communication", result.interactive_communication?.score],
    ["Global Achievement", result.global_achievement?.score],
  ] : [];

  return (
    <main className="min-h-screen bg-white p-4 text-slate-900 sm:p-6">
      <section className="mx-auto max-w-5xl rounded-3xl border border-cyan-200 bg-cyan-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-cyan-700">AI Speaking Assessor • Cambridge A1–B1</p>
            <h1 className="mt-1 text-2xl font-extrabold">Practise and get feedback</h1>
            <p className="mt-2 text-slate-700"><b>Situation {scenarioIndex + 1}:</b> {scenarios[scenarioIndex]}</p>
          </div>
          <button onClick={toggleRecording} disabled={loading} className={`rounded-2xl px-6 py-3 font-bold text-white shadow ${recording ? "bg-red-600" : "bg-cyan-700"} disabled:opacity-50`}>
            {loading ? "⏳ Assessing…" : recording ? "■ Stop & assess" : "🎙 Start recording"}
          </button>
        </div>

        {recording && <p className="mt-4 animate-pulse font-semibold text-red-600">● Recording — speak clearly, then press Stop & assess.</p>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
        {transcript && <div className="mt-5 rounded-2xl bg-white p-4"><h2 className="font-bold">Your transcript</h2><p className="mt-1 text-slate-700">{transcript}</p></div>}

        {result && <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-emerald-100 px-4 py-2 font-bold text-emerald-700">Overall {result.overall_score}/5</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([label, score]) => <div key={String(label)} className="rounded-2xl bg-white p-3 text-center shadow-sm"><div className="text-2xl font-extrabold text-cyan-700">{String(score ?? 0)}/5</div><div className="mt-1 text-xs font-semibold">{label}</div></div>)}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Feedback title="Route feedback" text={result.route_accuracy?.feedback_vi} />
            <Feedback title="Pronunciation note" text={result.pronunciation?.feedback_vi} />
            <Feedback title="Corrected answer" text={result.corrected_answer} />
            <Feedback title="Model answer" text={result.model_answer} />
          </div>
          {result.next_step_vi && <div className="rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-4"><b>Next step:</b> {result.next_step_vi}</div>}
          <p className="text-xs text-slate-500">*Pronunciation is a provisional AI estimate, not an official Cambridge result.</p>
        </div>}
      </section>
    </main>
  );
}

function Feedback({ title, text }: { title: string; text?: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="font-bold text-cyan-800">{title}</h3><p className="mt-1 text-sm text-slate-700">{text || "—"}</p></div>;
}
