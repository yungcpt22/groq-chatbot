"use client";

import { useRef, useState } from "react";

type Mode = "chat" | "writing" | "speaking";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type WritingPart = {
  text: string;
  status: "good" | "error" | "neutral";
};

type WritingCorrection = {
  category?: string;
  original?: string;
  corrected?: string;
  explanation_vi?: string;
};

type WritingCriterion = {
  band?: number;
  strengths?: string[];
  problems?: string[];
  advice?: string[];
};

type WritingResult = {
  overall_band?: number;
  task_response?: WritingCriterion;
  coherence_cohesion?: WritingCriterion;
  lexical_resource?: WritingCriterion;
  grammar?: WritingCriterion;
  annotated_text?: WritingPart[];
  corrections?: WritingCorrection[];
  idea_development?: {
    idea_vi?: string;
    example_en?: string;
  }[];
  improved_version?: string;
  band_7_plus_version?: string;
  priority_improvements?: string[];
};

type TranscriptPart = {
  text: string;
  status: "good" | "error" | "neutral";
};

type SpeakingCorrection = {
  type?: string;
  original?: string;
  corrected?: string;
  explanation_vi?: string;
};

type PracticeWord = {
  word?: string;
  ipa?: string;
  focus?: string;
  tip_vi?: string;
  example?: string;
};

type SpeakingAnalysis = {
  overall_band?: number;

  fluency?: {
    band?: number;
    strengths?: string[];
    problems?: string[];
    advice?: string[];
  };

  lexical?: {
    band?: number;
    strengths?: string[];
    problems?: string[];
    better_vocabulary?: string[];
  };

  grammar?: {
    band?: number;
    strengths?: string[];
    problems?: string[];
  };

  pronunciation?: {
    estimated_band?: number;
    status?: string;
    message_vi?: string;
    practice_words?: PracticeWord[];
    rhythm_advice_vi?: string[];
    intonation_advice_vi?: string[];
  };

  transcript_parts?: TranscriptPart[];
  corrections?: SpeakingCorrection[];

  idea_expansion?: {
    idea_vi?: string;
    example_en?: string;
  }[];

  shadowing_answer?: string;
  priority_improvements?: string[];
};

type AudioMetrics = {
  duration_seconds?: number | null;
  words_per_minute?: number | null;
  filler_count?: number;
  long_pauses?: {
    after: string;
    duration: number;
  }[];
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("chat");

  // CHAT
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // WRITING
  const [writingInput, setWritingInput] = useState("");
  const [writingLoading, setWritingLoading] = useState(false);
  const [writingResult, setWritingResult] =
    useState<WritingResult | null>(null);

  // SPEAKING
  const [recording, setRecording] = useState(false);
  const [speakingLoading, setSpeakingLoading] = useState(false);
  const [speakingTranscript, setSpeakingTranscript] = useState("");
  const [speakingAnalysis, setSpeakingAnalysis] =
    useState<SpeakingAnalysis | null>(null);

  const [audioMetrics, setAudioMetrics] =
    useState<AudioMetrics | null>(null);

  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // =========================================================
  // CHAT
  // =========================================================

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: Message = {
      role: "user",
      content: chatInput.trim(),
    };

    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "chat",
          messages: newMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể gửi câu hỏi.");
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.message || "",
        },
      ]);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Có lỗi xảy ra khi gửi câu hỏi."
      );
    } finally {
      setChatLoading(false);
    }
  }

  function handleChatKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  }

  // =========================================================
  // WRITING
  // =========================================================

  async function analyseWriting() {
    if (!writingInput.trim() || writingLoading) return;

    setWritingLoading(true);
    setWritingResult(null);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "writing",
          messages: [
            {
              role: "user",
              content: writingInput.trim(),
            },
          ],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể chấm Writing.");
      }

      if (!data.result) {
        throw new Error(
          "API chưa trả về dữ liệu chấm Writing đúng định dạng."
        );
      }

      setWritingResult(data.result);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Có lỗi xảy ra khi chấm Writing."
      );
    } finally {
      setWritingLoading(false);
    }
  }

  // =========================================================
  // SPEAKING
  // =========================================================

  async function startRecording() {
    try {
      setError("");
      setSpeakingAnalysis(null);
      setSpeakingTranscript("");
      setAudioMetrics(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        streamRef.current?.getTracks().forEach((track) => {
          track.stop();
        });

        streamRef.current = null;

        await analyseSpeaking(blob);
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error(err);

      setError(
        "Không thể sử dụng microphone. Hãy kiểm tra quyền Microphone của trình duyệt."
      );
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    setRecording(false);
  }

  async function analyseSpeaking(blob: Blob) {
    setSpeakingLoading(true);
    setError("");

    try {
      const extension = blob.type.includes("mp4")
        ? "m4a"
        : blob.type.includes("ogg")
          ? "ogg"
          : "webm";

      const file = new File([blob], `speaking.${extension}`, {
        type: blob.type || "audio/webm",
      });

      const formData = new FormData();

      formData.append("audio", file);

      const response = await fetch("/api/speaking-audio", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Không thể phân tích Speaking."
        );
      }

      setSpeakingTranscript(data.transcript || "");
      setSpeakingAnalysis(data.analysis || null);
      setAudioMetrics(data.audio_metrics || null);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Có lỗi xảy ra khi phân tích Speaking."
      );
    } finally {
      setSpeakingLoading(false);
    }
  }

  // =========================================================
  // TEXT TO SPEECH
  // =========================================================

  function speak(text?: string) {
    if (!text) return;

    if (
      typeof window === "undefined" ||
      !window.speechSynthesis
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-US";
    utterance.rate = 0.85;

    window.speechSynthesis.speak(utterance);
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white">
  <div className="mx-auto max-w-6xl px-5 py-5">

    <div className="flex items-center gap-4">
      <img
        src="/logo.png"
        alt="Technical College of Communications"
        className="h-16 w-16 rounded-full object-contain"
      />

      <div>
        <h1 className="text-2xl font-bold">
          English Coach AI
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Chat • Writing Coach • Speaking Coach
        </p>
      </div>
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
            <TabButton
              active={mode === "chat"}
              onClick={() => setMode("chat")}
            >
              💬 Chat
            </TabButton>

            <TabButton
              active={mode === "writing"}
              onClick={() => setMode("writing")}
            >
              ✍️ Writing
            </TabButton>

            <TabButton
              active={mode === "speaking"}
              onClick={() => setMode("speaking")}
            >
              🎙️ Speaking
            </TabButton>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* =====================================================
            CHAT
        ===================================================== */}

        {mode === "chat" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold">
                💬 AI Chat
              </h2>

              <p className="mt-2 text-slate-500">
                Hỏi về grammar, vocabulary, IELTS hoặc bất kỳ
                vấn đề tiếng Anh nào.
              </p>
            </div>

            <div className="min-h-[420px] rounded-3xl border bg-white p-6">
              {messages.length === 0 && (
                <div className="flex min-h-[350px] items-center justify-center text-center text-slate-400">
                  Hãy đặt câu hỏi để bắt đầu.
                </div>
              )}

              <div className="space-y-5">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={
                      message.role === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }
                  >
                    <div
                      className={
                        message.role === "user"
                          ? "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-4 py-3"
                          : "max-w-[85%] whitespace-pre-wrap px-2 py-3"
                      }
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <p className="text-slate-500">
                    AI đang trả lời...
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Nhập câu hỏi..."
                rows={3}
                className="flex-1 resize-none rounded-2xl border bg-white p-4 outline-none focus:border-slate-400"
              />

              <button
                type="button"
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="rounded-2xl bg-black px-6 font-semibold text-white disabled:bg-slate-300"
              >
                {chatLoading ? "..." : "Gửi"}
              </button>
            </div>
          </section>
        )}

        {/* =====================================================
            WRITING
        ===================================================== */}

        {mode === "writing" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold">
                ✍️ Writing Coach
              </h2>

              <p className="mt-2 text-slate-500">
                Dán bài IELTS Writing để AI chấm, sửa lỗi và
                đề xuất cách cải thiện.
              </p>
            </div>

            <div className="rounded-3xl border bg-white p-6">
              <textarea
                value={writingInput}
                onChange={(e) => setWritingInput(e.target.value)}
                placeholder="Paste your IELTS Writing essay here..."
                rows={14}
                className="w-full resize-y rounded-2xl border p-4 outline-none focus:border-slate-400"
              />

              <button
                type="button"
                onClick={analyseWriting}
                disabled={writingLoading || !writingInput.trim()}
                className="mt-4 rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:bg-slate-300"
              >
                {writingLoading
                  ? "Đang chấm..."
                  : "Chấm Writing"}
              </button>
            </div>

            {writingResult && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-black p-7 text-white">
                  <p className="text-slate-300">
                    Estimated Overall
                  </p>

                  <p className="mt-2 text-6xl font-bold">
                    {displayScore(writingResult.overall_band)}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Band do AI ước lượng, không phải điểm IELTS
                    chính thức.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <ScoreCard
                    title="Task Response"
                    score={writingResult.task_response?.band}
                  />

                  <ScoreCard
                    title="Coherence"
                    score={
                      writingResult.coherence_cohesion?.band
                    }
                  />

                  <ScoreCard
                    title="Lexical Resource"
                    score={writingResult.lexical_resource?.band}
                  />

                  <ScoreCard
                    title="Grammar"
                    score={writingResult.grammar?.band}
                  />
                </div>

                <div className="rounded-3xl border bg-white p-6">
                  <h3 className="text-2xl font-bold">
                    📝 Your Writing
                  </h3>

                  <p className="mt-2 text-sm text-slate-500">
                    🟢 Cụm dùng tốt • 🔴 Lỗi cần sửa
                  </p>

                  <div className="mt-5 flex flex-wrap gap-1 text-lg leading-8">
                    {writingResult.annotated_text?.length ? (
                      writingResult.annotated_text.map(
                        (part, index) => (
                          <span
                            key={index}
                            className={
                              part.status === "good"
                                ? "rounded bg-green-100 px-1 text-green-700"
                                : part.status === "error"
                                  ? "rounded bg-red-100 px-1 text-red-700 underline decoration-red-500 decoration-2"
                                  : ""
                            }
                          >
                            {part.text}
                          </span>
                        )
                      )
                    ) : (
                      <p className="whitespace-pre-wrap">
                        {writingInput}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border bg-white p-6">
                  <h3 className="text-2xl font-bold">
                    🔎 Lỗi và cách sửa
                  </h3>

                  {writingResult.corrections?.length ? (
                    <div className="mt-5 space-y-4">
                      {writingResult.corrections.map(
                        (item, index) => (
                          <div
                            key={index}
                            className="rounded-2xl bg-slate-50 p-5"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              {item.category || "Correction"}
                            </p>

                            {item.original && (
                              <p className="mt-2 text-red-600">
                                ✗ {item.original}
                              </p>
                            )}

                            {item.corrected && (
                              <p className="mt-2 text-green-700">
                                ✓ {item.corrected}
                              </p>
                            )}

                            {item.explanation_vi && (
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                {item.explanation_vi}
                              </p>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-slate-500">
                      Không có lỗi cụ thể được trả về.
                    </p>
                  )}
                </div>

                <WritingCriterionSection
                  title="Task Response"
                  data={writingResult.task_response}
                />

                <WritingCriterionSection
                  title="Coherence & Cohesion"
                  data={writingResult.coherence_cohesion}
                />

                <WritingCriterionSection
                  title="Lexical Resource"
                  data={writingResult.lexical_resource}
                />

                <WritingCriterionSection
                  title="Grammatical Range & Accuracy"
                  data={writingResult.grammar}
                />

                {writingResult.idea_development &&
                  writingResult.idea_development.length > 0 && (
                    <div className="rounded-3xl border bg-white p-6">
                      <h3 className="text-2xl font-bold">
                        💡 Mở rộng ý tưởng
                      </h3>

                      <p className="mt-2 text-slate-500">
                        Gợi ý giúp phát triển luận điểm rõ và sâu
                        hơn.
                      </p>

                      <div className="mt-5 space-y-4">
                        {writingResult.idea_development.map(
                          (item, index) => (
                            <div
                              key={index}
                              className="rounded-2xl bg-amber-50 p-5"
                            >
                              {item.idea_vi && (
                                <p className="font-semibold">
                                  💡 {item.idea_vi}
                                </p>
                              )}

                              {item.example_en && (
                                <p className="mt-3 leading-7">
                                  <span className="font-semibold">
                                    Example:
                                  </span>{" "}
                                  {item.example_en}
                                </p>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {writingResult.priority_improvements &&
                  writingResult.priority_improvements.length >
                    0 && (
                    <ListCard
                      title="🎯 Ưu tiên cải thiện"
                      items={
                        writingResult.priority_improvements
                      }
                    />
                  )}

                {writingResult.improved_version && (
                  <TextResultCard
                    title="✨ Improved Version"
                    text={writingResult.improved_version}
                  />
                )}

                {writingResult.band_7_plus_version && (
                  <TextResultCard
                    title="🚀 Band 7+ Reference"
                    text={writingResult.band_7_plus_version}
                  />
                )}
              </div>
            )}
          </section>
        )}

        {/* =====================================================
            SPEAKING
        ===================================================== */}

        {mode === "speaking" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold">
                🎙️ Speaking Coach
              </h2>

              <p className="mt-2 text-slate-500">
                Ghi âm để nhận transcript, sửa lỗi, đánh giá
                Fluency, Vocabulary, Grammar và nhận hướng dẫn
                luyện phát âm.
              </p>
            </div>

            <div className="rounded-3xl border bg-white p-6">
              <button
                type="button"
                onClick={
                  recording ? stopRecording : startRecording
                }
                disabled={speakingLoading}
                className={
                  recording
                    ? "rounded-2xl bg-red-500 px-7 py-4 font-semibold text-white"
                    : "rounded-2xl bg-black px-7 py-4 font-semibold text-white disabled:bg-slate-300"
                }
              >
                {recording
                  ? "⏹ Dừng ghi âm"
                  : "🎙️ Bắt đầu nói"}
              </button>

              {recording && (
                <p className="mt-4 font-medium text-red-500">
                  ● Đang ghi âm — hãy nói tiếng Anh...
                </p>
              )}

              {speakingLoading && (
                <p className="mt-4 text-slate-500">
                  AI đang nhận diện và phân tích bài nói...
                </p>
              )}
            </div>

            {speakingAnalysis && (
              <>
                <div className="rounded-3xl bg-black p-7 text-white">
                  <p className="text-slate-300">
                    Estimated Overall
                  </p>

                  <p className="mt-2 text-6xl font-bold">
                    {displayScore(
                      speakingAnalysis.overall_band
                    )}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Điểm do AI ước lượng, không phải điểm IELTS
                    Speaking chính thức.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <ScoreCard
                    title="Fluency & Coherence"
                    score={speakingAnalysis.fluency?.band}
                  />

                  <ScoreCard
                    title="Lexical Resource"
                    score={speakingAnalysis.lexical?.band}
                  />

                  <ScoreCard
                    title="Grammar"
                    score={speakingAnalysis.grammar?.band}
                  />

                  <ScoreCard
                    title="Pronunciation"
                    score={
                      speakingAnalysis.pronunciation
                        ?.estimated_band
                    }
                  />
                </div>

                {audioMetrics && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <MetricCard
                      title="Speaking speed"
                      value={
                        audioMetrics.words_per_minute != null
                          ? `${audioMetrics.words_per_minute} WPM`
                          : "—"
                      }
                    />

                    <MetricCard
                      title="Long pauses"
                      value={String(
                        audioMetrics.long_pauses?.length ?? 0
                      )}
                    />

                    <MetricCard
                      title="Filler words"
                      value={String(
                        audioMetrics.filler_count ?? 0
                      )}
                    />
                  </div>
                )}

                {/* TRANSCRIPT */}

                <div className="rounded-3xl border bg-white p-6">
                  <h3 className="text-2xl font-bold">
                    📝 Your Transcript
                  </h3>

                  <p className="mt-2 text-sm text-slate-500">
                    🟢 Cụm dùng tốt • 🔴 Lỗi cần sửa
                  </p>

                  <div className="mt-5 flex flex-wrap gap-1 text-lg leading-9">
                    {speakingAnalysis.transcript_parts?.length ? (
                      speakingAnalysis.transcript_parts.map(
                        (part, index) => (
                          <span
                            key={index}
                            className={
                              part.status === "good"
                                ? "rounded-md bg-green-100 px-1.5 py-0.5 text-green-700"
                                : part.status === "error"
                                  ? "rounded-md bg-red-100 px-1.5 py-0.5 text-red-700 underline decoration-red-500 decoration-2"
                                  : "px-0.5"
                            }
                          >
                            {part.text}
                          </span>
                        )
                      )
                    ) : (
                      <p className="whitespace-pre-wrap">
                        {speakingTranscript}
                      </p>
                    )}
                  </div>
                </div>

                {/* CORRECTIONS */}

                <div className="rounded-3xl border bg-white p-6">
                  <h3 className="text-2xl font-bold">
                    🔎 Lỗi và cách sửa
                  </h3>

                  {speakingAnalysis.corrections?.length ? (
                    <div className="mt-5 space-y-4">
                      {speakingAnalysis.corrections.map(
                        (item, index) => (
                          <div
                            key={index}
                            className="rounded-2xl bg-slate-50 p-5"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              {item.type || "Correction"}
                            </p>

                            {item.original && (
                              <p className="mt-3 text-lg text-red-600">
                                ✗ {item.original}
                              </p>
                            )}

                            {item.corrected && (
                              <p className="mt-2 text-lg text-green-700">
                                ✓ {item.corrected}
                              </p>
                            )}

                            {item.explanation_vi && (
                              <p className="mt-3 leading-7 text-slate-600">
                                {item.explanation_vi}
                              </p>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-slate-500">
                      Không có lỗi cụ thể được trả về.
                    </p>
                  )}
                </div>

                {/* FLUENCY */}

                <SpeakingCriterionSection
                  title="🗣️ Fluency & Coherence"
                  band={speakingAnalysis.fluency?.band}
                  strengths={
                    speakingAnalysis.fluency?.strengths
                  }
                  problems={speakingAnalysis.fluency?.problems}
                  advice={speakingAnalysis.fluency?.advice}
                />

                {/* LEXICAL */}

                <SpeakingCriterionSection
                  title="📚 Lexical Resource"
                  band={speakingAnalysis.lexical?.band}
                  strengths={
                    speakingAnalysis.lexical?.strengths
                  }
                  problems={speakingAnalysis.lexical?.problems}
                  advice={
                    speakingAnalysis.lexical
                      ?.better_vocabulary
                  }
                  adviceTitle="Từ/cụm từ nên dùng"
                />

                {/* GRAMMAR */}

                <SpeakingCriterionSection
                  title="🧩 Grammatical Range & Accuracy"
                  band={speakingAnalysis.grammar?.band}
                  strengths={
                    speakingAnalysis.grammar?.strengths
                  }
                  problems={speakingAnalysis.grammar?.problems}
                />

                {/* PRONUNCIATION */}

                {speakingAnalysis.pronunciation && (
                  <div className="rounded-3xl border bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-bold">
                          🔊 Pronunciation Coaching
                        </h3>

                        <p className="mt-2 text-sm text-slate-500">
                          Hướng dẫn luyện phát âm dựa trên dữ liệu
                          mà hệ thống có thể phân tích.
                        </p>
                      </div>

                      {speakingAnalysis.pronunciation
                        .estimated_band != null && (
                        <div className="rounded-2xl bg-slate-100 px-5 py-3">
                          <p className="text-xs text-slate-500">
                            Estimated
                          </p>

                          <p className="text-3xl font-bold">
                            {displayScore(
                              speakingAnalysis.pronunciation
                                .estimated_band
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {speakingAnalysis.pronunciation.message_vi && (
                      <div className="mt-5 rounded-2xl bg-amber-50 p-5 text-slate-700">
                        {
                          speakingAnalysis.pronunciation
                            .message_vi
                        }
                      </div>
                    )}

                    {speakingAnalysis.pronunciation
                      .practice_words &&
                      speakingAnalysis.pronunciation
                        .practice_words.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-lg font-bold">
                            🎯 Từ nên luyện
                          </h4>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            {speakingAnalysis.pronunciation.practice_words.map(
                              (item, index) => (
                                <div
                                  key={index}
                                  className="rounded-2xl border bg-slate-50 p-5"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-xl font-bold">
                                        {item.word || "Word"}
                                      </p>

                                      {item.ipa && (
                                        <p className="mt-1 text-blue-600">
                                          {item.ipa}
                                        </p>
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        speak(item.word)
                                      }
                                      className="rounded-xl border bg-white px-4 py-2 hover:bg-slate-100"
                                    >
                                      🔊 Nghe
                                    </button>
                                  </div>

                                  {item.focus && (
                                    <p className="mt-3">
                                      <span className="font-semibold">
                                        Focus:
                                      </span>{" "}
                                      {item.focus}
                                    </p>
                                  )}

                                  {item.tip_vi && (
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                      💡 {item.tip_vi}
                                    </p>
                                  )}

                                  {item.example && (
                                    <div className="mt-4 rounded-xl bg-white p-3">
                                      <p className="text-sm text-slate-500">
                                        Example
                                      </p>

                                      <p className="mt-1">
                                        {item.example}
                                      </p>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          speak(item.example)
                                        }
                                        className="mt-3 text-sm font-semibold text-blue-600"
                                      >
                                        🔊 Nghe câu mẫu
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {speakingAnalysis.pronunciation
                      .rhythm_advice_vi &&
                      speakingAnalysis.pronunciation
                        .rhythm_advice_vi.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-lg font-bold">
                            🎵 Rhythm & Stress
                          </h4>

                          <ul className="mt-3 space-y-2">
                            {speakingAnalysis.pronunciation.rhythm_advice_vi.map(
                              (item, index) => (
                                <li
                                  key={index}
                                  className="rounded-xl bg-slate-50 p-3"
                                >
                                  • {item}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}

                    {speakingAnalysis.pronunciation
                      .intonation_advice_vi &&
                      speakingAnalysis.pronunciation
                        .intonation_advice_vi.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-lg font-bold">
                            🎶 Intonation
                          </h4>

                          <ul className="mt-3 space-y-2">
                            {speakingAnalysis.pronunciation.intonation_advice_vi.map(
                              (item, index) => (
                                <li
                                  key={index}
                                  className="rounded-xl bg-slate-50 p-3"
                                >
                                  • {item}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                  </div>
                )}

                {/* IDEA EXPANSION */}

                {speakingAnalysis.idea_expansion &&
                  speakingAnalysis.idea_expansion.length > 0 && (
                    <div className="rounded-3xl border bg-white p-6">
                      <h3 className="text-2xl font-bold">
                        💡 Mở rộng ý tưởng
                      </h3>

                      <p className="mt-2 text-slate-500">
                        Những cách giúp câu trả lời dài hơn, tự
                        nhiên hơn và có chiều sâu hơn.
                      </p>

                      <div className="mt-5 space-y-4">
                        {speakingAnalysis.idea_expansion.map(
                          (item, index) => (
                            <div
                              key={index}
                              className="rounded-2xl bg-blue-50 p-5"
                            >
                              {item.idea_vi && (
                                <p className="font-semibold text-slate-900">
                                  💡 {item.idea_vi}
                                </p>
                              )}

                              {item.example_en && (
                                <>
                                  <p className="mt-3 leading-7">
                                    {item.example_en}
                                  </p>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      speak(item.example_en)
                                    }
                                    className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-600"
                                  >
                                    🔊 Nghe câu mẫu
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* SHADOWING */}

                {speakingAnalysis.shadowing_answer && (
                  <div className="rounded-3xl border bg-white p-6">
                    <h3 className="text-2xl font-bold">
                      🎧 Shadowing Practice
                    </h3>

                    <p className="mt-2 text-slate-500">
                      Nghe câu trả lời mẫu, sau đó nói theo để
                      luyện nhịp điệu và cách diễn đạt.
                    </p>

                    <div className="mt-5 rounded-2xl bg-violet-50 p-5">
                      <p className="whitespace-pre-wrap text-lg leading-8">
                        {speakingAnalysis.shadowing_answer}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          speak(
                            speakingAnalysis.shadowing_answer
                          )
                        }
                        className="mt-5 rounded-xl bg-black px-5 py-3 font-semibold text-white"
                      >
                        🔊 Nghe câu trả lời mẫu
                      </button>
                    </div>
                  </div>
                )}

                {/* PRIORITIES */}

                {speakingAnalysis.priority_improvements &&
                  speakingAnalysis.priority_improvements.length >
                    0 && (
                    <ListCard
                      title="🎯 Ưu tiên cải thiện"
                      items={
                        speakingAnalysis.priority_improvements
                      }
                    />
                  )}

                {/* RECORD AGAIN */}

                <div className="rounded-3xl border bg-white p-6 text-center">
                  <h3 className="text-xl font-bold">
                    🔁 Luyện lại
                  </h3>

                  <p className="mt-2 text-slate-500">
                    Áp dụng các gợi ý phía trên rồi ghi âm lại để
                    so sánh.
                  </p>

                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={recording || speakingLoading}
                    className="mt-5 rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:bg-slate-300"
                  >
                    🎙️ Nói lại
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <footer className="border-t bg-white px-5 py-5 text-center text-xs text-slate-400">
        AI có thể mắc lỗi. Điểm IELTS chỉ là ước lượng và không
        thay thế đánh giá chính thức.
      </footer>
    </main>
  );
}

// =============================================================
// COMPONENTS
// =============================================================

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-xl bg-black px-5 py-2.5 font-semibold text-white"
          : "rounded-xl bg-slate-100 px-5 py-2.5 font-semibold text-slate-600 hover:bg-slate-200"
      }
    >
      {children}
    </button>
  );
}

function ScoreCard({
  title,
  score,
}: {
  title: string;
  score?: number;
}) {
  return (
    <div className="rounded-3xl border bg-white p-6">
      <p className="text-sm text-slate-500">{title}</p>

      <p className="mt-3 text-4xl font-bold">
        {displayScore(score)}
      </p>
    </div>
  );
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-slate-500">{title}</p>

      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function WritingCriterionSection({
  title,
  data,
}: {
  title: string;
  data?: WritingCriterion;
}) {
  if (!data) return null;

  return (
    <div className="rounded-3xl border bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{title}</h3>

        {data.band != null && (
          <div className="rounded-xl bg-slate-100 px-4 py-2">
            <span className="text-sm text-slate-500">
              Band{" "}
            </span>

            <span className="text-xl font-bold">
              {displayScore(data.band)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <FeedbackList
          title="✓ Điểm tốt"
          items={data.strengths}
          type="good"
        />

        <FeedbackList
          title="✗ Vấn đề"
          items={data.problems}
          type="bad"
        />

        <FeedbackList
          title="💡 Cách cải thiện"
          items={data.advice}
          type="normal"
        />
      </div>
    </div>
  );
}

function SpeakingCriterionSection({
  title,
  band,
  strengths,
  problems,
  advice,
  adviceTitle = "Cách cải thiện",
}: {
  title: string;
  band?: number;
  strengths?: string[];
  problems?: string[];
  advice?: string[];
  adviceTitle?: string;
}) {
  if (
    band == null &&
    !strengths?.length &&
    !problems?.length &&
    !advice?.length
  ) {
    return null;
  }

  return (
    <div className="rounded-3xl border bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{title}</h3>

        {band != null && (
          <div className="rounded-xl bg-slate-100 px-4 py-2">
            <span className="text-sm text-slate-500">
              Band{" "}
            </span>

            <span className="text-xl font-bold">
              {displayScore(band)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <FeedbackList
          title="✓ Điểm tốt"
          items={strengths}
          type="good"
        />

        <FeedbackList
          title="✗ Cần cải thiện"
          items={problems}
          type="bad"
        />

        <FeedbackList
          title={`💡 ${adviceTitle}`}
          items={advice}
          type="normal"
        />
      </div>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  type,
}: {
  title: string;
  items?: string[];
  type: "good" | "bad" | "normal";
}) {
  const background =
    type === "good"
      ? "bg-green-50"
      : type === "bad"
        ? "bg-red-50"
        : "bg-blue-50";

  return (
    <div className={`rounded-2xl p-5 ${background}`}>
      <h4 className="font-bold">{title}</h4>

      {items?.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {items.map((item, index) => (
            <li key={index}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">
          Chưa có nhận xét.
        </p>
      )}
    </div>
  );
}

function TextResultCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border bg-white p-6">
      <h3 className="text-2xl font-bold">{title}</h3>

      <p className="mt-5 whitespace-pre-wrap leading-8">
        {text}
      </p>
    </div>
  );
}

function ListCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-3xl border bg-white p-6">
      <h3 className="text-2xl font-bold">{title}</h3>

      <div className="mt-5 space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex gap-3 rounded-2xl bg-slate-50 p-4"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
              {index + 1}
            </div>

            <p className="leading-7">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function displayScore(score?: number) {
  if (score == null || Number.isNaN(score)) {
    return "—";
  }

  return String(score);
}