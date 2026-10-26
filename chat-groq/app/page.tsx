"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

type Stats = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastModel: string;
  lastMs: number;
  lastTokensPerSec: number;
};

const MODEL = "qwen/qwen3.8-27b";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MESSAGES_KEY = "chat-messages";
const STATS_KEY = "chat-stats";

const EMPTY_STATS: Stats = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  lastModel: "-",
  lastMs: 0,
  lastTokensPerSec: 0,
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 1) Al abrir la página: cargar lo guardado en localStorage
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem(MESSAGES_KEY);
      const savedStats = localStorage.getItem(STATS_KEY);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedStats) setStats(JSON.parse(savedStats));
    } catch {
      // Si el contenido guardado está dañado, empezamos de cero
    }
    setLoaded(true);
  }, []);

  // 2) Cada vez que cambian mensajes o estadísticas: guardarlos
  //    (solo después de haber cargado, para no pisar lo guardado con una lista vacía)
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [messages, stats, loaded]);

  // 3) Bajar automáticamente al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    // Historial COMPLETO: todos los turnos anteriores + el nuevo
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const start = performance.now();

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, messages: newMessages }),
      });

      const ms = Math.round(performance.now() - start);

      if (!res.ok) {
        let detail = "";
        try {
          const errData = await res.json();
          detail = errData?.error?.message ?? "";
        } catch {}

        if (res.status === 401)
          throw new Error("API Key inválida o ausente. Revisa tu archivo .env.local.");
        if (res.status === 429)
          throw new Error("Demasiadas peticiones. Espera un momento e inténtalo de nuevo.");
        if (res.status === 400 || res.status === 404)
          throw new Error(`Petición o modelo no válido. ${detail}`);
        throw new Error(`El servidor respondió con un error (${res.status}). ${detail}`);
      }

      const data = await res.json();

      // Algunos modelos de razonamiento incluyen su "pensamiento" entre <think>...</think>
      const raw: string = data.choices[0].message.content ?? "";
      const content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      setMessages([...newMessages, { role: "assistant", content }]);

      // Acumular los tokens de toda la sesión
      const usage = data.usage;
      setStats((prev) => ({
        promptTokens: prev.promptTokens + usage.prompt_tokens,
        completionTokens: prev.completionTokens + usage.completion_tokens,
        totalTokens: prev.totalTokens + usage.total_tokens,
        lastModel: data.model,
        lastMs: ms,
        lastTokensPerSec: ms > 0 ? +(usage.completion_tokens / (ms / 1000)).toFixed(1) : 0,
      }));
    } catch (e) {
      setMessages(messages); // quita el mensaje que falló
      setInput(text); // lo devuelve a la caja para reintentar
      if (e instanceof TypeError) {
        setError("No se pudo conectar con la API. Revisa tu conexión a internet.");
      } else {
        setError(e instanceof Error ? e.message : "Ocurrió un error inesperado.");
      }
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    setMessages([]);
    setStats(EMPTY_STATS);
    setError(null);
    localStorage.removeItem(MESSAGES_KEY);
    localStorage.removeItem(STATS_KEY);
  }

  return (
    <div className="flex h-screen bg-white text-gray-900">
      {/* Zona del chat */}
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b p-4">
          <h1 className="text-lg font-bold">Chat con Groq</h1>
          <button
            onClick={clearConversation}
            className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
          >
            Borrar conversación
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !loading && (
            <p className="text-gray-500">Escribe un mensaje para empezar.</p>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] whitespace-pre-wrap rounded-lg p-3 ${
                m.role === "user"
                  ? "ml-auto bg-blue-600 text-white"
                  : "mr-auto bg-gray-200 text-gray-900"
              }`}
            >
              {m.content}
            </div>
          ))}

          {loading && (
            <div className="mr-auto rounded-lg bg-gray-100 p-3 text-gray-500">
              Pensando...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 border-t p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Escribe tu mensaje..."
            disabled={loading}
            className="flex-1 rounded border p-2 text-gray-900"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </main>

      {/* Panel de estadísticas */}
      <aside className="w-64 space-y-3 border-l bg-gray-50 p-4 text-sm">
        <h2 className="font-bold">Uso de tokens (sesión)</h2>
        <p>Tokens de prompt: <strong>{stats.promptTokens}</strong></p>
        <p>Tokens de completado: <strong>{stats.completionTokens}</strong></p>
        <p>Total: <strong>{stats.totalTokens}</strong></p>

        <h2 className="pt-2 font-bold">Última respuesta</h2>
        <p>Modelo: <strong>{stats.lastModel}</strong></p>
        <p>Tiempo: <strong>{stats.lastMs} ms</strong></p>
        <p>Velocidad: <strong>{stats.lastTokensPerSec} tokens/s</strong></p>
      </aside>
    </div>
  );
}