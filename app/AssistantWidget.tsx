"use client";

import React, { useState } from "react";

export function AssistantWidget({ dataContext }: { dataContext: unknown }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Olá! Sou a Inteligência Comercial da Atlas 2026. Como posso ajudar com seus dados hoje?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    const newMessages = [...messages, { role: "user" as const, text: userMessage }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const apiMessages = newMessages.map(msg => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.text
      }));

      const response = await fetch("/api/ai/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, dataContext })
      });

      const data = await response.json();
      
      if (data.error) {
        setMessages((prev) => [...prev, { role: "ai", text: `Erro: ${data.error}` }]);
      } else {
        setMessages((prev) => [...prev, { role: "ai", text: data.result }]);
      }
    } catch (error: unknown) {
      setMessages((prev) => [...prev, { role: "ai", text: "Ocorreu um erro ao conectar com o assistente." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="floating-widget card-3d-wrapper">
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          style={{
            background: "var(--atlas-orange)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: "60px",
            height: "60px",
            cursor: "pointer",
            fontSize: "24px",
            boxShadow: "0 10px 20px rgba(255,86,24,0.3)"
          }}
          className="card-3d-inner"
        >
          ✨
        </button>
      )}

      {isOpen && (
        <div 
          className="glassmorphism rounded-2xl card-3d-inner"
          style={{
            width: "350px",
            height: "500px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)"
          }}
        >
          <div style={{ padding: "16px", background: "var(--atlas-orange)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderTopLeftRadius: "1rem", borderTopRightRadius: "1rem" }}>
            <strong style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Atlas IA</span> 
              <span style={{ fontSize: "10px", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: "10px" }}>2026</span>
            </strong>
            <button onClick={() => setIsOpen(false)} style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", fontSize: "16px" }}>✖</button>
          </div>
          
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ 
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background: msg.role === "user" ? "var(--atlas-orange)" : "rgba(255,255,255,0.7)",
                color: msg.role === "user" ? "white" : "var(--atlas-graphite)",
                padding: "10px 14px",
                borderRadius: "1rem",
                borderBottomRightRadius: msg.role === "user" ? "2px" : "1rem",
                borderBottomLeftRadius: msg.role === "ai" ? "2px" : "1rem",
                maxWidth: "85%",
                fontSize: "14px",
                lineHeight: "1.4"
              }}>
                {msg.text}
              </div>
            ))}
            {isLoading && (
              <div style={{ alignSelf: "flex-start", fontSize: "12px", color: "var(--atlas-muted)" }}>
                Pensando...
              </div>
            )}
          </div>
          
          <div style={{ padding: "12px", borderTop: "1px solid rgba(0,0,0,0.05)", display: "flex", gap: "8px" }}>
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Faça uma pergunta..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.1)", outline: "none" }}
            />
            <button 
              onClick={sendMessage}
              disabled={isLoading}
              style={{ 
                background: "var(--atlas-graphite)", 
                color: "white", 
                border: "none", 
                borderRadius: "20px", 
                padding: "0 16px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
