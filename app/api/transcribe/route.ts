import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return Response.json(
        { error: "Không tìm thấy file ghi âm." },
        { status: 400 }
      );
    }

    const transcription = await groq.audio.transcriptions.create({
      file: audio,
      model: "whisper-large-v3-turbo",
      language: "en",
      response_format: "verbose_json",
      temperature: 0,
    });

    return Response.json({
      text: transcription.text,
      transcription,
    });
  } catch (error) {
    console.error("Transcription error:", error);

    return Response.json(
      {
        error: "Không thể nhận diện giọng nói.",
      },
      {
        status: 500,
      }
    );
  }
}