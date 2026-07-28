"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Check local storage or system preference
    const savedTheme = localStorage.getItem("atlas-theme");
    if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      // eslint-disable-next-line
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("atlas-theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <button 
      onClick={toggleTheme}
      style={{
        background: "transparent",
        border: "1px solid var(--atlas-line)",
        borderRadius: "20px",
        padding: "6px 12px",
        cursor: "pointer",
        color: "var(--atlas-graphite)",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "14px",
        fontWeight: "bold",
        transition: "all 0.3s ease"
      }}
      title="Alternar Modo Escuro"
    >
      {theme === "light" ? "🌙 Escuro" : "☀️ Claro"}
    </button>
  );
}
