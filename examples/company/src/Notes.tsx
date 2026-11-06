// Sticky notes people and agents left in the world. A note names a service
// and, optionally, a wall of that service's room; where it hangs is worked
// out from today's plan, so notes stay put in meaning when the building is
// re-laid out around them.
import { PANEL_STANDOFF, StickyNote, hashStr, hungOnWall } from "site-world";
import type { StickyNote as Note } from "./factory/notes";
import { PLAN } from "./plan";
import { DATABASES } from "./factory/infra";
import { tankSpot, wallSpot } from "./placement";
import { besideSlot } from "./routes";
import { useLod } from "./useLod";

const NOTE = 0.5;

// Tanks stand against walls behind their owners; a note hung behind one would be hidden.
const TANKS = DATABASES.flatMap((db) => {
  const slot = PLAN.slotByName[db.owner];
  return slot ? [tankSpot(slot)] : [];
});

function when(days: number): string {
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
}

function PinnedNote({ note, reduce }: { note: Note; reduce: boolean }) {
  const slot = PLAN.slotByName[note.service]!;
  const room = PLAN.roomById[slot.room]!;
  const lod = useLod(room.rect);
  if (lod === "campus") return null;
  // A hand-placed look: each note leans its own few degrees.
  const tilt = (((hashStr(note.id) % 100) / 100) - 0.5) * 0.14;
  const common = { text: note.text, author: note.author.name, by: note.author.kind, when: when(note.writtenDaysAgo), size: NOTE, tilt, reduce };
  if (note.wall) {
    const spot = wallSpot(room, note.wall, slot.pos, PLAN.doors, NOTE / 2 + 0.1, TANKS);
    const [x, z] = hungOnWall(spot.wall, spot.rotationY, PANEL_STANDOFF);
    return <StickyNote position={[x, 1.75, z]} rotationY={spot.rotationY} {...common} />;
  }
  // Beside the pylon, opposite the agents' working side and above head height.
  const [x, z] = besideSlot(slot, [-1.2, 0.5]);
  return <StickyNote position={[x, 2.3, z]} floating {...common} />;
}

export function Notes({ notes, reduce }: { notes: readonly Note[]; reduce: boolean }) {
  return (
    <>
      {notes.filter((n) => PLAN.slotByName[n.service]).map((n) => (
        <PinnedNote key={n.id} note={n} reduce={reduce} />
      ))}
    </>
  );
}
