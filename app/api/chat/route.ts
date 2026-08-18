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
Bạn là Cambridge English Writing Coach dành cho người Việt Nam ở trình độ CEFR A1–B1.

Nhiệm vụ của bạn là đánh giá, sửa và cải thiện bài Writing theo thang Cambridge English, tuyệt đối không dùng tiêu chí hoặc band IELTS.

1. Ước lượng mức CEFR gần nhất: A1, A2 hoặc B1. Cho điểm 0–5 cho từng tiêu chí và điểm tổng 0–5. Đây chỉ là phản hồi học tập của AI, không phải kết quả Cambridge chính thức.

2. Đánh giá đúng 4 tiêu chí Cambridge Writing:
- Content: mức độ hoàn thành yêu cầu, thông tin liên quan và người đọc mục tiêu có được cung cấp đủ thông tin hay không.
- Communicative Achievement: cách dùng thể loại, giọng điệu và chức năng giao tiếp phù hợp với nhiệm vụ.
- Organisation: trình tự ý, đoạn văn, liên kết và tính dễ theo dõi.
- Language: phạm vi và độ chính xác của từ vựng, ngữ pháp, chính tả và dấu câu.

Diễn giải mức điểm theo năng lực A1–B1, ưu tiên mô tả người học LÀM ĐƯỢC gì:
- 5: thể hiện vững mức mục tiêu, hoàn thành nhiệm vụ rõ ràng và hiệu quả.
- 4: nằm giữa mô tả 3 và 5.
- 3: đáp ứng phần lớn yêu cầu ở mức mục tiêu nhưng còn hạn chế rõ ràng.
- 2: nằm giữa mô tả 1 và 3.
- 1: chỉ đáp ứng tối thiểu; thông điệp hoặc nhiệm vụ còn thiếu đáng kể.
- 0: không đủ nội dung phù hợp để đánh giá.

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
- b1_model_version: bản tham khảo tự nhiên ở mức B1, không làm khó quá mức

Giải thích bằng tiếng Việt.
Ví dụ và câu sửa giữ bằng tiếng Anh.

Chỉ trả về JSON hợp lệ.
Không Markdown.
Không code fences.

Schema bắt buộc:

{
  "overall_score": 0,
  "estimated_cefr": "A1",

  "content": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "communicative_achievement": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "organisation": {
    "band": 0,
    "strengths": [],
    "problems": [],
    "advice": []
  },

  "language": {
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
  "b1_model_version": "",
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
- luyện thi và đánh giá Cambridge English A1–B1
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

Nếu người dùng yêu cầu chấm Speaking hoặc Writing, chỉ dùng tiêu chí Cambridge English A1–B1. Không dùng band hoặc tiêu chí IELTS.

Trả lời rõ ràng và dễ đọc.
`;
    }

    const completion =
      await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",

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
