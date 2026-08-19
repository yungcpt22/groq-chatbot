import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type WhisperSegment = { start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number };
type VerboseTranscription = { text?: string; duration?: number; segments?: WhisperSegment[] };

const scenarios = [
  { question: "You are at the post office. A visitor asks: How do I get to the university?", route: "Go straight along the road, cross the first intersection, and find the university on the left next to the pet store." },
  { question: "You are at the hotel. A tourist asks: What's the way to the train station?", route: "Go straight, go past the bridge and the repair shop, and find the train station on the right." },
  { question: "You are at the department store. Someone asks: Where is the pet store located?", route: "Go straight north, cross the intersection, and find the pet store on the left." },
  { question: "You are at the clock tower. A visitor asks: Is there a park near here?", route: "Go straight, cross the intersection, and find the park on the right." },
  { question: "You are at the train station. A worker asks: How do I get to the factory?", route: "Go straight north, go past the department store, and the factory is ahead." },
] as const;

const mapVocabulary = "post office, swimming pool, university, pet store, factory, clock tower, dry cleaner, park, department store, hotel, bridge, tunnel, repair shop, train station, go straight, turn left, turn right, cross the intersection, go past, next to, opposite, on your left, on your right, ahead";

function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function extractJson(text: string) {
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{"); const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI không trả về JSON hợp lệ.");
    return JSON.parse(text.slice(start, end + 1));
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) return Response.json({ error: "GROQ_API_KEY chưa được cấu hình." }, { status: 500 });
    const form = await request.formData();
    const audio = form.get("audio");
    const rawIndex = Number(form.get("scenarioIndex") ?? 0);
    const scenarioIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < scenarios.length ? rawIndex : 0;
    if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: "Không nhận được file ghi âm." }, { status: 400 });

    const scenario = scenarios[scenarioIndex];
    const transcription = (await groq.audio.transcriptions.create({
      file: audio,
      model: "whisper-large-v3-turbo",
      language: "en",
      prompt: `English learner giving directions. Situation: ${scenario.question}. Town-map words: ${mapVocabulary}.`,
      response_format: "verbose_json",
      temperature: 0,
      timestamp_granularities: ["segment"],
    })) as unknown as VerboseTranscription;

    const transcript = transcription.text?.trim() || "";
    if (!transcript) return Response.json({ error: "Không nhận dạng được lời nói. Hãy nói gần micro hơn và thử lại." }, { status: 422 });
    const segments = Array.isArray(transcription.segments) ? transcription.segments : [];
    const duration = numeric(transcription.duration) || numeric(segments.at(-1)?.end);
    const wordCount = transcript.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length || 0;
    const wordsPerMinute = duration > 0 ? Math.round((wordCount / duration) * 60) : null;
    const fillerCount = (transcript.match(/\b(?:um+|uh+|erm+|hmm+|you know|like)\b/gi) || []).length;
    const pauses = segments.slice(1).map((segment, index) => ({ after: String(segments[index]?.text || "").trim(), duration: Number((numeric(segment.start) - numeric(segments[index]?.end)).toFixed(2)) })).filter(pause => pause.duration >= 1);
    const segmentEvidence = segments.slice(0, 40).map(segment => ({ start: numeric(segment.start), end: numeric(segment.end), text: String(segment.text || "").trim(), avg_logprob: typeof segment.avg_logprob === "number" ? segment.avg_logprob : null, no_speech_prob: typeof segment.no_speech_prob === "number" ? segment.no_speech_prob : null }));

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `You are a careful Cambridge English A1-B1 speaking coach for Vietnamese learners.
Assess one Giving Directions response qualitatively. Never give a score, band, grade, percentage or estimated level.
ROUTE: Compare the response with the reference. Accept equivalent wording. List correct, missing and wrong steps and whether the destination can be reached.
GRAMMAR AND VOCABULARY: Give specific strengths and corrections. Every correction needs original, corrected and a short Vietnamese explanation. Suggest useful direction phrases.
PRONUNCIATION: Give cautious coaching from transcription stability, pace and pauses. Never invent individual sound errors. Suggest useful practice words with IPA.
FLUENCY: Comment on pace, fillers, long pauses, repetition and chunking using the supplied audio metadata.
INTERACTIVE COMMUNICATION: Discuss relevance, clarity, sequencing and whether the visitor gets sufficient help.
GLOBAL ACHIEVEMENT: State what the learner can do and one achievable next target.
Write feedback in Vietnamese; keep English examples in English. Return valid JSON only.
Schema:
{
 "route_accuracy":{"status":"correct|partly_correct|incorrect","destination_reached":true,"correct_steps":[],"missing_or_incorrect_steps":[],"feedback_vi":""},
 "grammar_vocabulary":{"feedback_vi":"","strengths":[],"corrections":[{"original":"","corrected":"","explanation_vi":""}],"useful_phrases":[]},
 "pronunciation":{"provisional":true,"intelligibility":"clear|mostly_clear|needs_practice","feedback_vi":"","practice_words":[{"word":"","ipa":"","tip_vi":""}]},
 "fluency":{"feedback_vi":"","strengths":[],"advice":[]},
 "interactive_communication":{"feedback_vi":"","strengths":[],"advice":[]},
 "global_achievement":{"feedback_vi":"","can_do":[],"next_target_vi":""},
 "transcript_parts":[{"text":"","status":"good|error|neutral"}],
 "corrected_answer":"","natural_model_answer":"","shadowing_chunks":[],"priority_improvements":[]
}` },
        { role: "user", content: JSON.stringify({ situation: scenario.question, reference_route: scenario.route, learner_transcript: transcript, audio_evidence: { duration_seconds: duration || null, words_per_minute: wordsPerMinute, filler_count: fillerCount, long_pauses: pauses, whisper_segments: segmentEvidence } }, null, 2) },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Groq không trả về kết quả chấm.");
    return Response.json({ transcript, metrics: { duration_seconds: duration || null, words_per_minute: wordsPerMinute, filler_count: fillerCount, long_pauses: pauses }, result: extractJson(content) });
  } catch (error) {
    console.error("Directions speaking assessment:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Không thể chấm bài nói." }, { status: 500 });
  }
}
