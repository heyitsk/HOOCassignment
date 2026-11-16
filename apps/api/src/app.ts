import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { handler } from "./controller/handler";

export const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors({ origin: process.env.WEB_ORIGIN ?? "*" }));

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", handler);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
