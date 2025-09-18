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

function imageRowToImage(row: any) {
  return {
    id: row.id as string,
    name: row.name as string,
    size: Number(row.size ?? 0),
    type: row.type as string,
    dataUrl: row.data_url as string,
    createdAt: (row.created_at as Date).toISOString?.() ?? String(row.created_at),
    tag: row.tag ?? undefined,
    templateId: row.template_id ?? undefined,
  };
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  await ensureTables();
  // Vercel fournit le paramètre via URL pathname
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "GET") {
    const { rows } = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const proj = rowToProject(rows[0]);
    const imgs = await sql`SELECT * FROM images WHERE project_id = ${id} ORDER BY created_at ASC`;
    proj.images = imgs.rows.map(imageRowToImage);
    return new Response(JSON.stringify(proj), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "PATCH") {
    const patch = await req.json();

    // Met à jour les champs simples du projet
    const nowIso = new Date().toISOString();
    const { rows } = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const current = rows[0];

    const next = {
      title: patch.title !== undefined ? String(patch.title) : current.title,
      address: patch.address !== undefined ? patch.address : current.address,
      type: patch.type !== undefined ? patch.type : current.type,
      status: patch.status !== undefined ? patch.status : current.status,
      prompt: patch.prompt !== undefined ? patch.prompt : current.prompt,
      template_id: patch.templateId !== undefined ? patch.templateId : current.template_id,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
    };

    await sql`
      UPDATE projects
      SET title = ${next.title},
          address = ${next.address},
          type = ${next.type},
          status = ${next.status},
          prompt = ${next.prompt},
          template_id = ${next.template_id},
          notes = ${next.notes},
          updated_at = ${nowIso}
      WHERE id = ${id}
    `;

    // Si patch.images est fourni, on remplace entièrement les images
    if (Array.isArray(patch.images)) {
      await sql`DELETE FROM images WHERE project_id = ${id}`;
      for (const img of patch.images as any[]) {
        const imgId = img.id || randomUUID();
        await sql`
          INSERT INTO images (id, project_id, name, size, type, data_url, created_at, tag, template_id)
          VALUES (${imgId}, ${id}, ${img.name || ""}, ${img.size || 0}, ${img.type || ""}, ${img.dataUrl || ""}, ${img.createdAt || nowIso}, ${img.tag || null}, ${img.templateId || null})
        `;
      }
    }

    // Retourne le projet mis à jour avec ses images
    const { rows: rows2 } = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
    const proj = rowToProject(rows2[0]);
    const imgs = await sql`SELECT * FROM images WHERE project_id = ${id} ORDER BY created_at ASC`;
    proj.images = imgs.rows.map(imageRowToImage);
    return new Response(JSON.stringify(proj), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "DELETE") {
    // Supprime d'abord les images (par sécurité si la FK n'avait pas ON DELETE CASCADE)
    await sql`DELETE FROM images WHERE project_id = ${id}`;
    await sql`DELETE FROM projects WHERE id = ${id}`;
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}