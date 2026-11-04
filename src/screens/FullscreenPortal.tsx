// Chrome dialogs (palette, shortcuts overlay) live at the shell root, so
// they vanish when the viewport takes the Fullscreen API — only the fullscreen
// element's descendants stay visible. Portal into that element when it is
// set, and back to document.body when it is not.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function FullscreenPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element>(() => document.fullscreenElement ?? document.body);

  useEffect(() => {
    const sync = () => setHost(document.fullscreenElement ?? document.body);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  return createPortal(children, host);
}
