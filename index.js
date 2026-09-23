import { fetchGoUsage, PROVIDER } from "./src/opencode-go-usage.js";

export default function opencodeGoUsage(pi) {
  const register = () => pi.events.emit("gentle-pi:usage-source/v1", {
    schema: "gentle-pi.usage-source/v1",
    provider: PROVIDER,
    pendingNote: "no Go usage yet · r to fetch",
    fetch: fetchGoUsage,
  });
  // Gentle Shell subscribes in its factory; registration at session start
  // also covers either extension load order and subsequent session switches.
  register();
  pi.on("session_start", register);
}
