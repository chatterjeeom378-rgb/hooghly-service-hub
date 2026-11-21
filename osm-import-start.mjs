import { adminClient, json } from "./_auth.mjs";
import { randomUUID } from "node:crypto";
export default async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const { client, token } = await adminClient(event);
    const job_id = randomUUID();
    const { error } = await client.from("import_jobs").insert({ id: job_id, status: "queued", started_by: (await client.auth.getUser(token)).data.user.id });
    if (error) throw error;
    const host = event.headers["x-forwarded-host"] || event.headers.host;
    const proto = event.headers["x-forwarded-proto"] || "https";
    const trigger = await fetch(`${proto}://${host}/.netlify/functions/osm-import-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ job_id })
    });
    if (!trigger.ok && trigger.status !== 202) {
      const msg = await trigger.text();
      await client.from("import_jobs").update({ status: "failed", error_message: `Background trigger failed: ${msg.slice(0,300)}` }).eq("id", job_id);
      throw new Error("Could not trigger background import.");
    }
    return json(202, { job_id, status: "queued" });
  } catch (e) { return json(403, { error: e.message }); }
};
