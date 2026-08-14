import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const {
      messages,
      mode = "chat",
    } = await req.json();

    let systemPrompt = "";

    if (mode === "writing") {
      systemPrompt = `
Bạn là IELTS Writing Coach dành cho người Việt Nam học tiếng Anh.

Nhiệm vụ của bạn là chấm, sửa và cải thiện bài Writing.

Khi người dùng gửi bài viết, hãy:

1. Ước lượng band IELTS Writing.
Lưu ý:
- Đây chỉ là band ước lượng của AI.
- Không được nói đây là điểm IELTS chính thức.

2. Đánh giá theo 4 tiêu chí:
- Task Response hoặc Task Achievement
- Coherence and Cohesion
- Lexical Resource
- Grammatical Range and Accuracy

3. Phát hiện lỗi trong bài:
- grammar
- vocabulary
- collocation
- word choice
- spelling
- expression
- sentence structure

4. Với mỗi lỗi, cung cấp:
- original
- corrected
- explanation_vi
- category

5. Phân tích bài viết thành các phần nhỏ để giao diện có thể highlight:

status = "good"
→ cụm từ/câu dùng tốt, có thể tô xanh.

status = "error"
→ lỗi rõ ràng, có thể tô đỏ.

status = "neutral"
→ phần bình thường.

Không tô xanh toàn bộ bài.

6. Đề xuất:
- cách cải thiện từng tiêu chí
- vocabulary tốt hơn
- cấu trúc câu tốt hơn
- cách phát triển ý

7. Viết:
- improved_version: bản sửa nhưng vẫn giữ ý người học
- band_7_plus_version: bản tham khảo tự nhiên và học thuật hơn

Giải thích bằng tiếng Việt.
Ví dụ và câu sửa giữ bằng tiếng Anh.

Chỉ trả về JSON hợp lệ.
Không Markdown.
Không code fences.

Schema bắt buộc:

{
  "overall_band": 0,

  "task_response": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "coherence_cohesion": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "lexical_resource": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "grammar": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "annotated_text": [
    {
      "text": "",
      "status": "neutral"
    }
  ],

  "corrections": [
    {
      "category": "grammar",
      "original": "",
      "corrected": "",
      "explanation_vi": ""
    }
  ],

  "idea_development": [
    {
      "idea_vi": "",
      "example_en": ""
    }
  ],

  "improved_version": "",
  "band_7_plus_version": "",
  "priority_improvements": []
}
`;
    } else {
      systemPrompt = `
Bạn là English Learning AI, một trợ lý và gia sư tiếng Anh.

Bạn hỗ trợ người dùng:
- hỏi đáp về tiếng Anh
- giải thích grammar
- vocabulary
- collocations
- pronunciation knowledge
- IPA
- paraphrase
- IELTS
- sửa câu
- dịch và giải thích cách sử dụng

Nếu người dùng hỏi một từ/cụm từ, khi phù hợp hãy cung cấp:
- nghĩa tiếng Việt
- IPA
- từ loại
- ví dụ
- collocations
- synonyms/paraphrases
- common mistakes

Nếu người dùng hỏi bằng tiếng Việt, ưu tiên giải thích bằng tiếng Việt.
Ví dụ tiếng Anh phải tự nhiên.

Không bịa thông tin.
Không giả vờ đã nghe audio nếu chỉ nhận văn bản.

Trả lời rõ ràng và dễ đọc.
`;
    }

    const completion =
      await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",

        temperature:
          mode === "writing" ? 0.2 : 0.5,

        ...(mode === "writing"
          ? {
              response_format: {
                type: "json_object" as const,
              },
            }
          : {}),

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages,
        ],
      });

    const content =
      completion.choices[0]?.message?.content ?? "";

    if (mode === "writing") {
      try {
        return Response.json({
          result: JSON.parse(content),
        });
      } catch {
        console.error(
          "Writing JSON parsing failed:",
          content
        );

        return Response.json(
          {
            error:
              "Không đọc được kết quả chấm Writing.",
          },
          {
            status: 500,
          }
        );
      }
    }

    return Response.json({
      message: content,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error:
          "Không thể kết nối với Groq AI.",
      },
      {
        status: 500,
      }
    );
  }
}