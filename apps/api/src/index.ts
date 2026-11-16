import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { handler } from "./controller/handler";

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", handler);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.PORT ?? 4000);

console.log(`API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
