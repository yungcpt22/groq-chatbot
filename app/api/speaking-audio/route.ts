import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

type WhisperSegment = {
  start?: number;
  end?: number;
  text?: string;
  avg_logprob?: number;
  no_speech_prob?: number;
};

type VerboseTranscription = {
  text?: string;
  duration?: number;
  segments?: WhisperSegment[];
};

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
    const transcription = (await groq.audio.transcriptions.create({
        file: audio,
        model: "whisper-large-v3-turbo",
        language: "en",
        response_format: "verbose_json",
        temperature: 0,
        timestamp_granularities: ["segment"],
      })) as unknown as VerboseTranscription;

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
      .map((segment: WhisperSegment, index: number) => {
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
Bạn là Cambridge English Speaking Coach dành cho người Việt Nam ở trình độ CEFR A1–B1.

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

CAMBRIDGE SPEAKING CRITERIA A1–B1

Đánh giá:

1. Grammar and Vocabulary: phạm vi, độ chính xác và khả năng kiểm soát ngôn ngữ phù hợp trình độ.
2. Pronunciation: mức độ dễ hiểu, âm, trọng âm từ, trọng âm câu, nhịp điệu và ngữ điệu. Đây chỉ là coaching estimate từ dữ liệu hiện có.
3. Interactive Communication: khả năng đáp ứng, duy trì lời nói, phát triển câu trả lời và mức độ cần hỗ trợ. Với bài độc thoại ngắn, chỉ ước lượng từ độ liên quan, độ trôi chảy và khả năng nối tiếp ý.
4. Global Achievement: khả năng truyền đạt ý nghĩa tổng thể trong các tình huống quen thuộc và tạo phát ngôn phù hợp mức A1, A2 hoặc B1.

Cho điểm 0–5 cho từng tiêu chí và điểm tổng 0–5; chỉ dùng số nguyên.
Ước lượng mức CEFR gần nhất là A1, A2 hoặc B1.
Mốc diễn giải:
- 5: thể hiện vững mức mục tiêu, truyền đạt hiệu quả dù có thể còn do dự.
- 4: nằm giữa mô tả 3 và 5.
- 3: truyền đạt được ý cơ bản trong tình huống quen thuộc; phát ngôn còn ngắn hoặc có do dự.
- 2: nằm giữa mô tả 1 và 3.
- 1: khó truyền đạt ý cơ bản; chủ yếu dùng từ hoặc cụm rất ngắn và cần nhiều hỗ trợ.
- 0: không đủ ngôn ngữ để đánh giá.

Tuyệt đối không dùng thuật ngữ, band hoặc tiêu chí IELTS.

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
  "overall_score": 0,
  "estimated_cefr": "A1",

  "interactive_communication": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "grammar_vocabulary": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "better_vocabulary": []
  },

  "global_achievement": {
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
