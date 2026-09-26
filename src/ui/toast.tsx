import { useCallback, useRef, useState } from "preact/hooks";

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef(0);
  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3200);
  }, []);
  const node = message ? (
    <div class="toast" role="alert" key={message}>
      ! {message}
    </div>
  ) : null;
  return [node, show] as const;
}
