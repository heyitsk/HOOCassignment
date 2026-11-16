import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);

console.log(`API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
