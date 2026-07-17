// src/hooks/useExternalScript.ts
import { useEffect, useState } from "react";

type ScriptStatus = "idle" | "loading" | "ready" | "error";

export const useExternalScript = (
  src: string | null,
  timeout = 8000
): ScriptStatus => {
  const [status, setStatus] = useState<ScriptStatus>(src ? "loading" : "idle");

  useEffect(() => {
    if (!src) return;

    let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    let timer: ReturnType<typeof setTimeout>;

    const handleLoad = () => {
      clearTimeout(timer);
      setStatus("ready");
    };

    const handleError = () => {
      clearTimeout(timer);
      script?.remove();
      setStatus("error");
    };

    if (!script) {
      script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
      document.body.appendChild(script);

      // timeout
      timer = setTimeout(() => handleError(), timeout);
    } else {
      setStatus("ready");
    }

    return () => {
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      clearTimeout(timer);
    };
  }, [src, timeout]);

  return status;
};