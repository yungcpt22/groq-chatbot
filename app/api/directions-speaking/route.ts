import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const scenarios = [
  {
    question: "You are at the post office. A visitor asks: How do I get to the university?",
    route: "Go straight along the road, cross the first intersection, and find the university on the left next to the pet store.",
  },
  {
    question: "You are at the hotel. A tourist asks: What's the way to the train station?",
    route: "Go straight, go past the bridge and the repair shop, and find the train station on the right.",
  },
  {
    question: "You are at the department store. Someone asks: Where is the pet store located?",
    route: "Go straight north, cross the intersection, and find the pet store on the left.",
  },
  {
    question: "You are at the clock tower. A visitor asks: Is there a park near here?",
    route: "Go straight, cross the intersection, and find the park on the right.",
  },
  {
    question: "You are at the train station. A worker asks: How do I get to the factory?",
    route: "Go straight north, go past the department store, and the factory is ahead.",
  },
] as const;

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return Response.json({ error: "GROQ_API_KEY chưa được cấu hình." }, { status: 500 });
    }

    const form = await request.formData();
    const audio = form.get("audio");
    const rawIndex = Number(form.get("scenarioIndex") ?? 0);
    const scenarioIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < scenarios.length ? rawIndex : 0;

    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json({ error: "Không nhận được file ghi âm." }, { status: 400 });
    }

    const transcription = await groq.audio.transcriptions.create({
      file: audio,
      model: "whisper-large-v3-turbo",
      language: "en",
      response_format: "json",
      temperature: 0,
    });

    const transcript = transcription.text?.trim();
    if (!transcript) {
      return Response.json({ error: "Không nhận dạng được lời nói. Hãy nói rõ hơn và thử lại." }, { status: 422 });
    }

    const scenario = scenarios[scenarioIndex];
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a supportive Cambridge English A1-B1 speaking assessor for Vietnamese learners.
Assess a Giving Directions response. Use integer scores from 0 to 5. Do not use IELTS bands.
Judge route accuracy against the reference route, but accept equivalent correct wording.
Pronunciation is only a cautious provisional estimate based on whether Whisper could transcribe the recording; do not invent individual sound errors.
Return valid JSON only with this exact structure:
{
  "estimated_cefr":"A1",
  "overall_score":0,
  "route_accuracy":{"score":0,"status":"partly correct","feedback_vi":""},
  "grammar_vocabulary":{"score":0,"strengths":[],"corrections":[]},
  "pronunciation":{"score":0,"provisional":true,"feedback_vi":""},
  "interactive_communication":{"score":0,"feedback_vi":""},
  "global_achievement":{"score":0,"feedback_vi":""},
  "corrected_answer":"",
  "model_answer":"",
  "next_step_vi":""
}`,
        },
        {
          role: "user",
          content: `Situation: ${scenario.question}\nReference route: ${scenario.route}\nLearner transcript: ${transcript}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Groq không trả về kết quả chấm.");

    return Response.json({ transcript, result: JSON.parse(content) });
  } catch (error) {
    console.error("Directions speaking assessment:", error);
    const message = error instanceof Error ? error.message : "Không thể chấm bài nói.";
    return Response.json({ error: message }, { status: 500 });
  }
}
