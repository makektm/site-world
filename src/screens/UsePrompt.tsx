// The walk-mode "[E] USE" prompt: a DOM sibling of the canvas, centred just
// below the crosshair, shown while a walker is in range of something E
// operates. One home for its look, so the demon switch and the machine
// consoles cannot drift apart.

export function UsePrompt({ label = "USE" }: { label?: string }) {
  return (
    <p
      style={{
        position: "absolute", left: "50%", top: "58%", transform: "translateX(-50%)",
        color: "#ece7da", fontFamily: "'IBM Plex Mono', monospace", fontSize: 14,
        letterSpacing: "0.08em", pointerEvents: "none", textShadow: "0 0 6px rgba(10,13,19,0.9)",
      }}
    >
      [E] {label}
    </p>
  );
}
