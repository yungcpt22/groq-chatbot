"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
    };

    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra");
      }

      const aiMessage: Message = {
        role: "assistant",
        content: data.message,
      };

      setMessages([...newMessages, aiMessage]);
    } catch (error) {
      console.error(error);

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Có lỗi xảy ra. Vui lòng thử lại.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <main className="flex h-screen flex-col bg-white text-black">

      <header className="border-b border-gray-200 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-semibold">
            My AI
          </h1>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">

          {messages.length === 0 && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
              <h2 className="text-3xl font-semibold">
                Xin chào 👋
              </h2>

              <p className="mt-3 text-gray-500">
                Tôi có thể giúp gì cho bạn?
              </p>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-gray-100 px-4 py-3"
                      : "max-w-[85%] whitespace-pre-wrap px-1 py-3"
                  }
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="px-1 py-3 text-gray-500">
                  AI đang trả lời...
                </div>
              </div>
            )}
          </div>

        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white p-4">

        <div className="mx-auto flex max-w-3xl items-end gap-3">

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi..."
            rows={1}
            className="max-h-40 min-h-[52px] flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-500"
          />

          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="h-[52px] rounded-2xl bg-black px-5 text-white disabled:bg-gray-300"
          >
            Gửi
          </button>

        </div>

        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-gray-400">
          AI có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.
        </p>

      </footer>

    </main>
  );
}