"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("klar-theme", next ? "dark" : "light");
    } catch {}
  }

  // Avoid a hydration mismatch: render nothing until we know the real state.
  if (!mounted) return <span className="theme-switch" style={{ visibility: "hidden" }} />;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Toggle dark mode"
      className="theme-switch"
      onClick={toggle}
    />
  );
}
