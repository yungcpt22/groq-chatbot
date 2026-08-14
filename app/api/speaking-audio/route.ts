import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function countFillers(text: string) {
  const fillers = [
    "uh",
    "um",
    "erm",
    "hmm",
    "you know",
    "like",
    "I mean",
  ];

  const lower = text.toLowerCase();

  let count = 0;

  for (const filler of fillers) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const matches = lower.match(
      new RegExp(`\\b${escaped}\\b`, "gi")
    );

    count += matches?.length ?? 0;
  }

  return count;
}

function calculateWPM(text: string, duration: number) {
  if (!duration || duration <= 0) return null;

  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  if (!words) return 0;

  return Math.round(words / (duration / 60));
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI không trả về JSON hợp lệ.");
    }

    return JSON.parse(text.slice(start, end + 1));
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return Response.json(
        {
          error: "Không tìm thấy file ghi âm.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * STEP 1
     * Chuyển audio thành transcript bằng Whisper.
     */
    const transcription: any =
      await groq.audio.transcriptions.create({
        file: audio,
        model: "whisper-large-v3-turbo",
        language: "en",
        response_format: "verbose_json",
        temperature: 0,
        timestamp_granularities: ["segment"],
      });

    const transcript = transcription.text?.trim() || "";

    if (!transcript) {
      return Response.json(
        {
          error: "Không nhận diện được nội dung giọng nói.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * STEP 2
     * Lấy thông tin thời lượng.
     */
    let duration = safeNumber(transcription.duration, 0);

    const segments = Array.isArray(transcription.segments)
      ? transcription.segments
      : [];

    if (!duration && segments.length > 0) {
      const lastSegment = segments[segments.length - 1];

      duration = safeNumber(lastSegment?.end, 0);
    }

    /*
     * STEP 3
     * Phân tích tốc độ nói.
     */
    const wordsPerMinute = calculateWPM(
      transcript,
      duration
    );

    const fillerCount = countFillers(transcript);

    /*
     * STEP 4
     * Phân tích khoảng dừng dựa trên timestamps.
     */
    const pauses: {
      after: string;
      duration: number;
    }[] = [];

    for (let i = 1; i < segments.length; i++) {
      const previous = segments[i - 1];
      const current = segments[i];

      const previousEnd = safeNumber(previous?.end, 0);
      const currentStart = safeNumber(current?.start, 0);

      const gap = currentStart - previousEnd;

      if (gap >= 1) {
        pauses.push({
          after: String(previous?.text || "").trim(),
          duration: Number(gap.toFixed(2)),
        });
      }
    }

    /*
     * STEP 5
     * Chuẩn bị thông tin cho Speaking Coach.
     */
    const segmentSummary = segments
      .slice(0, 50)
      .map((segment: any, index: number) => {
        return {
          index,
          start: safeNumber(segment?.start, 0),
          end: safeNumber(segment?.end, 0),
          text: String(segment?.text || "").trim(),
          avg_logprob:
            typeof segment?.avg_logprob === "number"
              ? segment.avg_logprob
              : null,
          no_speech_prob:
            typeof segment?.no_speech_prob === "number"
              ? segment.no_speech_prob
              : null,
        };
      });

    const systemPrompt = `
Bạn là IELTS Speaking Coach dành cho người Việt Nam học tiếng Anh.

Bạn phải đánh giá bài nói dựa trên transcript và metadata được cung cấp.

QUAN TRỌNG:

Bạn KHÔNG được tuyên bố chắc chắn rằng người học phát âm sai một phoneme cụ thể chỉ dựa trên transcript.

Groq Whisper chủ yếu là hệ thống speech-to-text, không phải phoneme-level pronunciation assessment.

Bạn có thể đưa ra nhận xét pronunciation dưới dạng COACHING ESTIMATE dựa trên:

- mức độ audio được nhận diện
- sự ổn định của transcript
- tốc độ nói
- hesitation
- filler words
- pauses
- repetition
- các cụm từ có khả năng khó phát âm đối với người Việt
- connected speech
- word stress
- sentence stress
- rhythm
- intonation

Nếu không đủ bằng chứng, phải nói rõ đó là gợi ý luyện tập, không phải xác nhận lỗi phát âm.

=========================

IELTS SPEAKING CRITERIA

Đánh giá:

1. Fluency & Coherence
2. Lexical Resource
3. Grammatical Range & Accuracy
4. Pronunciation Coaching Estimate

Band score sử dụng:

1
1.5
2
2.5
3
3.5
4
4.5
5
5.5
6
6.5
7
7.5
8
8.5
9

=========================

TRANSCRIPT MARKING

Chia transcript thành các cụm.

Mỗi cụm phải có status:

"good"
hoặc
"error"
hoặc
"neutral"

GOOD:

Cụm từ tự nhiên, chính xác hoặc đáng khuyến khích.

ERROR:

Có lỗi grammar, vocabulary hoặc cách diễn đạt.

NEUTRAL:

Không có lỗi rõ ràng nhưng cũng không cần highlight.

=========================

ERROR CORRECTION

Với mỗi lỗi cung cấp:

type:
"grammar"
"vocabulary"
"expression"

original

corrected

explanation_vi

=========================

IDEA EXPANSION

Đưa ra 2-4 cách giúp người học mở rộng câu trả lời.

Mỗi mục gồm:

idea_vi

example_en

=========================

PRONUNCIATION COACHING

Chọn tối đa 5 từ/cụm đáng luyện.

Mỗi mục gồm:

word

ipa

focus

tip_vi

example

Không khẳng định người học chắc chắn đã phát âm sai từ đó.

=========================

FLUENCY

Đánh giá:

- speaking rate
- hesitation
- filler words
- pauses
- repetition

Đưa ra nhận xét bằng tiếng Việt.

=========================

SHADOWING

Tạo một phiên bản câu trả lời tự nhiên hơn để người học luyện shadowing.

Không làm câu quá khó so với trình độ hiện tại.

=========================

OUTPUT

Chỉ trả JSON hợp lệ.

Không markdown.

Không dùng dấu \`\`\`.

Schema:

{
  "overall_band": 0,

  "fluency": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "lexical": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "better_vocabulary": []
  },

  "grammar": {
    "band": 0,
    "strengths": [],
    "problems": []
  },

  "pronunciation": {
    "estimated_band": 0,
    "status": "coaching_estimate",
    "message_vi": "",
    "practice_words": [],
    "rhythm_advice_vi": [],
    "intonation_advice_vi": []
  },

  "transcript_parts": [
    {
      "text": "",
      "status": "neutral"
    }
  ],

  "corrections": [
    {
      "type": "grammar",
      "original": "",
      "corrected": "",
      "explanation_vi": ""
    }
  ],

  "idea_expansion": [
    {
      "idea_vi": "",
      "example_en": ""
    }
  ],

  "shadowing_answer": "",

  "priority_improvements": []
}
`;

    /*
     * STEP 6
     * Gửi transcript + metadata cho LLM.
     */
    const completion =
      await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",

        temperature: 0.2,

        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },

          {
            role: "user",
            content: JSON.stringify(
              {
                transcript,
                duration_seconds: duration || null,
                words_per_minute: wordsPerMinute,
                filler_count: fillerCount,
                pauses,
                whisper_segments: segmentSummary,
              },
              null,
              2
            ),
          },
        ],
      });

    const raw =
      completion.choices[0]?.message?.content || "{}";

    const analysis = extractJson(raw);

    /*
     * STEP 7
     * Trả dữ liệu về frontend.
     */
    return Response.json({
      transcript,

      audio_metrics: {
        duration_seconds:
          duration > 0
            ? Number(duration.toFixed(2))
            : null,

        words_per_minute: wordsPerMinute,

        filler_count: fillerCount,

        long_pauses: pauses,
      },

      analysis,
    });
  } catch (error) {
    console.error(
      "Speaking audio analysis error:",
      error
    );

    return Response.json(
      {
        error:
          "Không thể phân tích bài Speaking. Vui lòng thử lại.",
      },
      {
        status: 500,
      }
    );
  }
}