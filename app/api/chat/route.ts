import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Bạn là một trợ lý AI hữu ích. Hãy trả lời rõ ràng, chính xác và thân thiện bằng ngôn ngữ mà người dùng sử dụng.",
        },
        ...messages,
      ],
      model: "llama-3.1-8b-instant",
    });

    return Response.json({
      message: completion.choices[0]?.message?.content ?? "",
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: "Không thể kết nối với Groq AI.",
      },
      {
        status: 500,
      }
    );
  }
}