import Groq from "groq-sdk";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export const runtime = "nodejs";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 12_000;

function extensionOf(name: string) {
  return name.toLowerCase().split(".").pop() || "";
}

function cleanText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function cleanOcrText(value: string) {
  let text = value.trim();

  // Some reasoning models expose their internal analysis before the final
  // transcription. Keep only the final answer when a closing tag is present.
  const closingThink = text.toLowerCase().lastIndexOf("</think>");
  if (closingThink !== -1) {
    text = text.slice(closingThink + "</think>".length);
  }

  // Defensive cleanup in case the provider returns a complete reasoning block.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/^```(?:text|plaintext)?\s*/i, "").replace(/```\s*$/i, "");
  text = text.replace(/^\s*(?:transcription|student(?:'s)? writing)\s*:\s*/i, "");

  // Remove one pair of quotation marks only when they wrap the whole result.
  text = text.trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("“") && text.endsWith("”")))
  ) {
    text = text.slice(1, -1);
  }

  return cleanText(text);
}

async function readImage(file: File) {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Ảnh phải nhỏ hơn 4 MB.");
  }

  const mime = file.type || `image/${extensionOf(file.name)}`;
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) {
    throw new Error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const completion = await groq.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    temperature: 0,
    max_completion_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a transcription engine, not an editor.
Transcribe the English writing in this image exactly as written.
Preserve spelling, grammar, punctuation, paragraph breaks and mistakes.
Do not correct, explain, translate, grade or add missing words.
Ignore printed worksheet instructions, page numbers and decorative text when they are clearly not part of the student's answer.
Do not show analysis, reasoning, self-correction, notes, labels, Markdown or XML tags.
Return only the student's transcribed writing as plain text. Your first character must be the first character of the student's answer.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${base64}` },
          },
        ],
      },
    ],
  });

  return cleanOcrText(completion.choices[0]?.message?.content || "");
}

async function readDocument(file: File) {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("File phải nhỏ hơn 10 MB.");
  }

  const ext = extensionOf(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "txt" || file.type.startsWith("text/")) {
    return cleanText(buffer.toString("utf8"));
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  if (ext === "pdf") {
    const result = await pdfParse(buffer);
    return cleanText(result.text);
  }

  throw new Error("Chỉ hỗ trợ JPG, PNG, WebP, PDF, DOCX và TXT.");
}

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return Response.json(
        { error: "Groq API chưa được cấu hình." },
        { status: 500 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Chưa chọn file bài viết." }, { status: 400 });
    }

    const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extensionOf(file.name));
    const text = isImage ? await readImage(file) : await readDocument(file);

    if (!text) {
      return Response.json(
        { error: "Không nhận diện được nội dung. Nếu đây là PDF scan, hãy chụp hoặc xuất từng trang thành ảnh JPG/PNG." },
        { status: 422 }
      );
    }

    return Response.json({ text, fileName: file.name, source: isImage ? "image" : "document" });
  } catch (error) {
    console.error("Writing upload failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể đọc file bài viết." },
      { status: 500 }
    );
  }
}
