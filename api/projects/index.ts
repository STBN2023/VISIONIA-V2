import { sql } from "@vercel/postgres";
import { randomUUID } from "crypto";

export const config = { runtime: "nodejs" };

async function ensureTables() {
  await sql`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    address TEXT,
    type TEXT,
    status TEXT NOT NULL,
    prompt TEXT,
    template_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT,
    size BIGINT,
    type TEXT,
    data_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tag TEXT,
    template_id TEXT
  )`;
}

function rowToProject(row: any) {
  return {
    id: row.id as string,
    title: row.title as string,
    address: row.address ?? undefined,
    type: row.type ?? undefined,
    status: row.status as "Brouillon" | "En cours" | "Terminé" | "Archivé",
    createdAt: (row.created_at as Date).toISOString?.() ?? String(row.created_at),
    updatedAt: (row.updated_at as Date).toISOString?.() ?? String(row.updated_at),
    prompt: row.prompt ?? "",
    templateId: row.template_id ?? undefined,
    images: [] as any[],
    notes: row.notes ?? undefined,
  };
}

export default async function handler(req: Request): Promise<Response> {
  await ensureTables();

  if (req.method === "GET") {
    const { rows } = await sql`SELECT * FROM projects ORDER BY updated_at DESC`;
    const data = rows.map(rowToProject);
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const id = randomUUID();
    const now = new Date();
    const title = String(body?.title || "").trim();
    const address = body?.address ? String(body.address).trim() : null;
    const type = body?.type ? String(body.type).trim() : null;

    if (title.length < 3) {
      return new Response(JSON.stringify({ error: "Title too short" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const status = "Brouillon";
    await sql`
      INSERT INTO projects (id, title, address, type, status, prompt, template_id, notes, created_at, updated_at)
      VALUES (${id}, ${title}, ${address}, ${type}, ${status}, ${""}, ${null}, ${null}, ${now.toISOString()}, ${now.toISOString()})
    `;

    const proj = {
      id,
      title,
      address: address ?? undefined,
      type: type ?? undefined,
      status,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      prompt: "",
      templateId: undefined,
      images: [] as any[],
      notes: undefined,
    };

    return new Response(JSON.stringify(proj), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}