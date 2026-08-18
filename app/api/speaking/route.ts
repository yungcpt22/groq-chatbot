import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return Response.json(
        { error: "Không có nội dung bài nói để đánh giá." },
        { status: 400 }
      );
    }

    const prompt = `
You are a Cambridge English Speaking Coach for Vietnamese learners at CEFR A1–B1.

Evaluate the learner's spoken English based on the transcript below.

IMPORTANT:
You are currently evaluating a TRANSCRIPT, not raw audio.
Therefore:
- Do not invent pronunciation errors.
- Do not claim to hear stress, intonation, rhythm, or individual sounds.
- Pronunciation must be marked as "audio_required" until audio analysis is available.
- Focus the current assessment on language and transcript-based fluency evidence.

Evaluate these Cambridge Speaking criteria:

1. GRAMMAR AND VOCABULARY
Consider:
- vocabulary range
- precision of word choice
- collocations
- range of grammatical structures
- grammatical accuracy
- systematic errors
- sentence formation

2. PRONUNCIATION
Do NOT estimate a pronunciation band from transcript alone.
Set its status to "audio_required".

3. INTERACTIVE COMMUNICATION
Estimate from relevance, response development, linking of ideas, hesitation and the apparent support needed. State that interaction is limited when only a monologue transcript is available.

4. GLOBAL ACHIEVEMENT
Judge how successfully the learner conveys basic meaning in familiar situations and whether utterances fit A1, A2 or B1.

Use integer scores from 0 to 5 and estimate CEFR as A1, A2 or B1. Never use IELTS terms or bands.

Return ONLY valid JSON.
Do not use Markdown.
Do not put the JSON inside code fences.

Use exactly this structure:

{
  "overall_score": 0,
  "estimated_cefr": "A1",
  "grammar_vocabulary": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },
  "interactive_communication": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },
  "global_achievement": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },
  "pronunciation": {
    "status": "audio_required",
    "message": "Pronunciation requires analysis of the original audio."
  },
  "better_answer": "",
  "priority_improvements": []
}

The feedback should be useful to a Vietnamese learner of English.
Write explanations and advice in Vietnamese.
Keep English examples in English.

Transcript:
"""${transcript}"""
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are a supportive Cambridge English A1–B1 Speaking Coach. Return valid JSON only and never use IELTS scoring.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      response_format: {
        type: "json_object",
      },
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("AI không trả về kết quả.");
    }

    const assessment = JSON.parse(content);

    return Response.json(assessment);
  } catch (error) {
    console.error("Speaking assessment error:", error);

    return Response.json(
      {
        error: "Không thể đánh giá bài nói.",
      },
      {
        status: 500,
      }
    );
  }
}
