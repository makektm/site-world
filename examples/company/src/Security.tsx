// The secrets layer: what is restricted and who holds the keys. A padlock
// over each door into the PCI zone, and a small one on every pylon that holds
// a live secret. Agents holding keys carry theirs (Agents.tsx), because the
// interesting question is the session that still holds one after its work.
import { DOOR_POST_W, EYE, Padlock, WARN } from "site-world";
import { SECRETS } from "./factory/infra";
import { PLAN } from "./plan";
import { besideSlot } from "./routes";
import { useLod } from "./useLod";

const HOLDERS = [...new Set(SECRETS.flatMap((s) => s.holders.filter((h) => h.kind === "service").map((h) => h.id)))];

function DoorLock({ door }: { door: (typeof PLAN.doors)[number] }) {
  const [x, z] = door.doorway.center;
  // On the wall beside the door at eye height, not over it, where the door's
  // own sign hangs; one on each face, since the lock is shallower than the wall.
  const across = door.doorway.axis === "z";
  const along = door.doorway.halfWidth + DOOR_POST_W + 0.35;
  const face = 0.17;
  const rot = across ? Math.PI / 2 : 0;
  return (
    <>
      {[-1, 1].map((s) => (
        <Padlock
          key={s}
          position={[x + (across ? s * face : along), EYE - 0.1, z + (across ? along : s * face)]}
          rotationY={rot + (s < 0 ? Math.PI : 0)}
          size={0.4}
          color={WARN}
        />
      ))}
    </>
  );
}

function PylonLock({ name }: { name: string }) {
  const slot = PLAN.slotByName[name]!;
  const lod = useLod(PLAN.roomById[slot.room]!.rect);
  if (lod === "campus") return null;
  const [x, z] = besideSlot(slot, [0, 0.34]);
  return <Padlock position={[x, 0.42, z]} rotationY={slot.facing} size={0.2} />;
}

export function Security({ restrictedDoors }: { restrictedDoors: (code: string) => boolean }) {
  return (
    <>
      {PLAN.doors.filter((d) => restrictedDoors(d.code)).map((d) => (
        <DoorLock key={d.id} door={d} />
      ))}
      {HOLDERS.filter((n) => PLAN.slotByName[n]).map((n) => (
        <PylonLock key={n} name={n} />
      ))}
    </>
  );
}
