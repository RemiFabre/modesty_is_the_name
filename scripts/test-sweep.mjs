// Smoke test for room cleanup: directly exercise rooms.ts's exported API.
import {
  createRoom,
  attachSocket,
  detachSocket,
  joinRoom,
  sweepStaleRooms,
  EMPTY_ROOM_TTL_MS,
  LONE_ROOM_TTL_MS,
  getRoom,
} from "../server/rooms.ts";

function caseLabel(s) {
  console.log("\n--- " + s);
}

function assertEq(label, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
}

caseLabel("empty room is swept after EMPTY_ROOM_TTL_MS");
{
  const { room, player } = createRoom("Alice", {});
  // No socket attached → empty since createRoom; backdate.
  room.emptySince = Date.now() - EMPTY_ROOM_TTL_MS - 1000;
  room.loneSince = Date.now() - EMPTY_ROOM_TTL_MS - 1000;
  const { deletedRooms } = sweepStaleRooms();
  assertEq("room was deleted", deletedRooms.includes(room.code), true);
  assertEq("getRoom returns undefined", getRoom(room.code), undefined);
}

caseLabel("lone room is swept after LONE_ROOM_TTL_MS");
{
  const { room, player } = createRoom("Bob", {});
  attachSocket(room, player, "sock-bob");
  // Now connected count = 1, loneSince = now, emptySince = null
  room.loneSince = Date.now() - LONE_ROOM_TTL_MS - 1000;
  const { deletedRooms, evictedSocketIds } = sweepStaleRooms();
  assertEq("room was deleted", deletedRooms.includes(room.code), true);
  assertEq("evicted socket included", evictedSocketIds.includes("sock-bob"), true);
}

caseLabel("room with 2+ connected stays alive past TTLs");
{
  const { room, player: host } = createRoom("Carol", {});
  attachSocket(room, host, "sock-carol");
  const { player: dave } = joinRoom(room.code, "Dave", undefined, "sock-dave");
  attachSocket(room, dave, "sock-dave");
  // both connected → emptySince = null, loneSince = null
  assertEq("emptySince cleared", room.emptySince, null);
  assertEq("loneSince cleared", room.loneSince, null);
  const { deletedRooms } = sweepStaleRooms();
  assertEq("room not deleted", deletedRooms.includes(room.code), false);
  assertEq("still retrievable", getRoom(room.code) === room, true);
}

caseLabel("after both disconnect, emptySince ticks, swept after window");
{
  const { room, player: host } = createRoom("Eve", {});
  attachSocket(room, host, "sock-eve");
  const { player: frank } = joinRoom(room.code, "Frank", undefined, "sock-frank");
  attachSocket(room, frank, "sock-frank");
  detachSocket("sock-eve");
  detachSocket("sock-frank");
  // both gone → emptySince should be set
  assertEq("emptySince set", typeof room.emptySince === "number", true);
  // not stale yet
  let r = sweepStaleRooms();
  assertEq("not yet swept", r.deletedRooms.includes(room.code), false);
  // backdate, sweep again
  room.emptySince = Date.now() - EMPTY_ROOM_TTL_MS - 1000;
  r = sweepStaleRooms();
  assertEq("now swept", r.deletedRooms.includes(room.code), true);
}

caseLabel("reconnect resets emptySince but keeps loneSince");
{
  const { room, player: host } = createRoom("Greta", {});
  attachSocket(room, host, "sock-greta");
  // count=1, lone since attach
  const initialLoneSince = room.loneSince;
  detachSocket("sock-greta");
  // count=0, emptySince set, loneSince stays
  assertEq("emptySince set on disconnect", typeof room.emptySince === "number", true);
  assertEq("loneSince unchanged on disconnect", room.loneSince, initialLoneSince);
  // reconnect via new socket id (simulating a refresh)
  attachSocket(room, host, "sock-greta-2");
  assertEq("emptySince cleared on reconnect", room.emptySince, null);
  assertEq("loneSince still original", room.loneSince, initialLoneSince);
}

console.log("\nAll cases done.");
