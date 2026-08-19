"use client";

import { useEffect, useRef, useState } from "react";

const scenarios = [
  "You are at the post office. How do I get to the university?",
  "You are at the hotel. What's the way to the train station?",
  "You are at the department store. Where is the pet store located?",
  "You are at the clock tower. Is there a park near here?",
  "You are at the train station. How do I get to the factory?",
];

type FeedbackItem = { feedback_vi?: string };
type Result = {
  route_accuracy?: FeedbackItem & { status?: string; destination_reached?: boolean; correct_steps?: string[]; missing_or_incorrect_steps?: string[] };
  grammar_vocabulary?: FeedbackItem & { strengths?: string[]; corrections?: { original?: string; corrected?: string; explanation_vi?: string }[]; useful_phrases?: string[] };
  pronunciation?: FeedbackItem & { provisional?: boolean; intelligibility?: string; practice_words?: { word?: string; ipa?: string; tip_vi?: string }[] };
  fluency?: FeedbackItem & { strengths?: string[]; advice?: string[] };
  interactive_communication?: FeedbackItem & { strengths?: string[]; advice?: string[] };
  global_achievement?: FeedbackItem & { can_do?: string[]; next_target_vi?: string };
  corrected_answer?: string;
  natural_model_answer?: string;
  shadowing_chunks?: string[];
  priority_improvements?: string[];
};

type Metrics = { duration_seconds?: number | null; words_per_minute?: number | null; filler_count?: number; long_pauses?: { after?: string; duration?: number }[] };

export default function DirectionsSpeaking() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
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
          setMetrics(null);
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
      setMetrics(data.metrics || null);
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
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        streamRef.current?.getTracks().forEach(track => track.stop());
        if (blob.size < 1500) setError("Bản ghi quá ngắn. Hãy nói ít nhất một câu đầy đủ rồi thử lại.");
        else void sendAudio(blob);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Không mở được micro. Hãy cho phép trình duyệt sử dụng micro rồi thử lại.");
    }
  }

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
          {metrics && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Duration" value={metrics.duration_seconds ? `${metrics.duration_seconds.toFixed(1)}s` : "—"} /><Metric label="Speaking rate" value={metrics.words_per_minute ? `${metrics.words_per_minute} wpm` : "—"} /><Metric label="Fillers" value={String(metrics.filler_count ?? 0)} /><Metric label="Long pauses" value={String(metrics.long_pauses?.length ?? 0)} /></div>}
          <div className="grid gap-4 md:grid-cols-2">
            <DetailedFeedback title="Route accuracy" text={result.route_accuracy?.feedback_vi} good={result.route_accuracy?.correct_steps} improve={result.route_accuracy?.missing_or_incorrect_steps} />
            <DetailedFeedback title="Grammar & Vocabulary" text={result.grammar_vocabulary?.feedback_vi} good={result.grammar_vocabulary?.strengths} improve={result.grammar_vocabulary?.useful_phrases} />
            <DetailedFeedback title="Pronunciation coaching" text={result.pronunciation?.feedback_vi} improve={result.pronunciation?.practice_words?.map(item => `${item.word || ""} ${item.ipa || ""} — ${item.tip_vi || ""}`)} />
            <DetailedFeedback title="Fluency" text={result.fluency?.feedback_vi} good={result.fluency?.strengths} improve={result.fluency?.advice} />
            <DetailedFeedback title="Interactive Communication" text={result.interactive_communication?.feedback_vi} good={result.interactive_communication?.strengths} improve={result.interactive_communication?.advice} />
            <DetailedFeedback title="Global Achievement" text={result.global_achievement?.feedback_vi} good={result.global_achievement?.can_do} improve={result.global_achievement?.next_target_vi ? [result.global_achievement.next_target_vi] : []} />
            <Feedback title="Corrected answer" text={result.corrected_answer} />
            <Feedback title="Natural model answer" text={result.natural_model_answer} />
          </div>
          {!!result.grammar_vocabulary?.corrections?.length && <div className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="font-bold text-cyan-800">Corrections</h3><div className="mt-3 space-y-3">{result.grammar_vocabulary.corrections.map((item, index) => <div key={index} className="rounded-xl border border-red-100 bg-red-50 p-3"><p><span className="text-red-700 line-through">{item.original}</span> → <b className="text-emerald-700">{item.corrected}</b></p><p className="mt-1 text-sm text-slate-600">{item.explanation_vi}</p></div>)}</div></div>}
          {!!result.shadowing_chunks?.length && <div className="rounded-2xl bg-violet-50 p-4"><h3 className="font-bold text-violet-800">Shadowing practice</h3><div className="mt-2 flex flex-wrap gap-2">{result.shadowing_chunks.map((chunk, index) => <span key={index} className="rounded-full bg-white px-3 py-2 text-sm font-semibold">{chunk}</span>)}</div></div>}
          {!!result.priority_improvements?.length && <div className="rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-4"><b>Focus next:</b><List items={result.priority_improvements} /></div>}
          <p className="text-xs text-slate-500">*Pronunciation is a provisional AI estimate, not an official Cambridge result.</p>
        </div>}
      </section>
    </main>
  );
}

function Feedback({ title, text }: { title: string; text?: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="font-bold text-cyan-800">{title}</h3><p className="mt-1 text-sm text-slate-700">{text || "—"}</p></div>;
}

function DetailedFeedback({ title, text, good, improve }: { title: string; text?: string; good?: string[]; improve?: string[] }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="font-bold text-cyan-800">{title}</h3><p className="mt-1 text-sm text-slate-700">{text || "—"}</p>{!!good?.length && <div className="mt-3"><b className="text-sm text-emerald-700">What you did well</b><List items={good} /></div>}{!!improve?.length && <div className="mt-3"><b className="text-sm text-amber-700">Improve / practise</b><List items={improve} /></div>}</div>;
}

function List({ items }: { items?: string[] }) { return <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{items?.map((item, index) => <li key={index}>{item}</li>)}</ul>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white p-3 text-center shadow-sm"><div className="font-extrabold text-cyan-700">{value}</div><div className="text-xs text-slate-500">{label}</div></div>; }
