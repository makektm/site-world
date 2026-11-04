// A guided tour that answers one question by walking the camera through the
// evidence: "Why is checkout slow?" Checkout is `orders` calling `payments`;
// payments has a replica down; the fix is written but waits in the review
// pile; and the agent that wrote it is stuck waiting on a person.
//
// Captions are components, so they read the live factory as the tour plays
// instead of reciting numbers frozen when the tour was written.
import { useSelection, type TourStop } from "site-world";
import { useFactory } from "./factory/feed";
import { STATION_AT } from "./FactoryHall";
import { useFeed } from "./liveFeed";
import { PLAN } from "./plan";
import { SELECTION } from "./worldState";

export const TOUR_TITLE = "Why is checkout slow?";
/** The stop that follows a stuck agent; the host picks which one when it gets there. */
export const AGENT_STOP = "agent";

const P = (name: string) => PLAN.slotByName[name]!.pos;

function OrdersCaption() {
  const feed = useFeed();
  const o = feed.orders;
  return (
    <>
      Checkout is <b>orders</b>. Its p99 is {o ? `${o.p99}ms` : "up"}, and every order calls <b>payments</b> on the way out —
      follow the arc overhead.
    </>
  );
}

function PaymentsCaption() {
  const p = useFeed().payments;
  const down = p ? p.replicas.filter((r) => r === "down").length : 0;
  return (
    <>
      In the PCI zone, <b>payments</b> is {p?.health === "ok" ? "healthy now" : "degraded"}: {down} of {p?.replicas.length ?? 0} replicas
      down (the cube on the floor), so the rest carry the load slower.
    </>
  );
}

function ReviewCaption() {
  const f = useFactory();
  const fixes = f.reviewPile.filter((i) => i.service === "orders" || i.service === "payments").length;
  return (
    <>
      The fixes exist. {f.reviewPile.length} PRs wait at REVIEW for three people{fixes ? `, ${fixes} of them for orders or payments` : ""}.
      Agents write faster than humans read: this pile is the factory's real bottleneck.
    </>
  );
}

function AgentCaption() {
  const f = useFactory();
  const { selected } = useSelection(SELECTION);
  const a = selected?.kind === "agent" ? f.agents.find((x) => x.id === selected.id) : undefined;
  if (!a) return <>The agent on the checkout fix.</>;
  return (
    <>
      <b>{a.name}</b> ({a.task}) {a.blockedOn ? <>is stuck: <b>{a.blockedOn}</b>.</> : <>is {a.state} on {a.service}.</>} The camera follows it;
      unblock it from the on-call terminal in EDGE, or approve the top PR there.
    </>
  );
}

const ROOM_FRAME = { distance: 13, elevation: 0.9 };

export const CHECKOUT_TOUR: readonly TourStop[] = [
  {
    id: "orders",
    title: "1 · checkout",
    caption: <OrdersCaption />,
    at: [P("orders")[0], 1.4, P("orders")[1]],
    frame: { distance: 8 },
    select: { kind: "service", id: "orders" },
  },
  {
    id: "payments",
    title: "2 · payments, degraded",
    caption: <PaymentsCaption />,
    at: [P("payments")[0], 1.2, P("payments")[1]],
    frame: ROOM_FRAME,
    select: { kind: "service", id: "payments" },
  },
  {
    id: "review",
    title: "3 · the review pile",
    caption: <ReviewCaption />,
    at: [STATION_AT.review![0], 1, STATION_AT.review![1]],
    frame: { distance: 10, elevation: 0.75 },
    select: { kind: "stage", id: "review" },
  },
  {
    id: AGENT_STOP,
    title: "4 · the stuck agent",
    caption: <AgentCaption />,
  },
];
