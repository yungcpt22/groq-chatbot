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
You are an expert English Speaking Coach and IELTS Speaking examiner.

Evaluate the learner's spoken English based on the transcript below.

IMPORTANT:
You are currently evaluating a TRANSCRIPT, not raw audio.
Therefore:
- Do not invent pronunciation errors.
- Do not claim to hear stress, intonation, rhythm, or individual sounds.
- Pronunciation must be marked as "audio_required" until audio analysis is available.
- Focus the current assessment on language and transcript-based fluency evidence.

Evaluate these IELTS Speaking criteria:

1. FLUENCY AND COHERENCE
Consider:
- fluency
- hesitation visible in the transcript
- repetition
- self-correction
- filler words
- coherence
- discourse markers
- development of ideas

2. LEXICAL RESOURCE
Consider:
- vocabulary range
- precision of word choice
- collocations
- idiomatic language
- paraphrasing
- inappropriate vocabulary
- repeated vocabulary

3. GRAMMATICAL RANGE AND ACCURACY
Consider:
- range of grammatical structures
- simple and complex sentences
- grammatical accuracy
- systematic errors
- sentence formation

4. PRONUNCIATION
Do NOT estimate a pronunciation band from transcript alone.
Set its status to "audio_required".

Use IELTS-style bands from 0 to 9.
Half bands such as 5.5, 6.5 and 7.5 are allowed.

Return ONLY valid JSON.
Do not use Markdown.
Do not put the JSON inside code fences.

Use exactly this structure:

{
  "overall_band": 0,
  "fluency_coherence": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },
  "lexical_resource": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "better_vocabulary": []
  },
  "grammar": {
    "band": 0,
    "strengths": [],
    "errors": [
      {
        "original": "",
        "corrected": "",
        "explanation": ""
      }
    ],
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
            "You are a strict but helpful English Speaking Coach. Return valid JSON only.",
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