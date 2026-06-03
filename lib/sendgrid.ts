import client from "@sendgrid/client";

// SendGrid v3 Web API wrapper (server-side only). Scope: create a Design in the Design Library
// from the studio's generated HTML. No audience, nothing sendable — a human builds the Single
// Send from the design inside SendGrid.

let configured = false;
function getClient() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not set");
  if (!configured) {
    client.setApiKey(apiKey);
    configured = true;
  }
  return client;
}

export interface CreateDesignInput {
  name: string;
  html: string;
  subject: string;
}

export interface CreatedDesign {
  id: string;
  name: string;
  /** Best-effort link to the design in the SendGrid UI. */
  editorUrl: string;
}

interface SendGridError {
  code?: number;
  response?: { statusCode?: number; body?: { errors?: { message?: string }[] } };
}

/** Pull SendGrid's real error message + a hint when it's a missing-scope 403. */
function describeError(err: unknown): string {
  const e = err as SendGridError;
  const status = e.response?.statusCode ?? e.code;
  const detail = e.response?.body?.errors?.[0]?.message || (err instanceof Error ? err.message : "request failed");
  if (status === 403) {
    return `SendGrid 403: ${detail}. The API key is missing the Marketing scope — create a key with Marketing → Read/Write (Designs live under Marketing).`;
  }
  if (status === 401) return `SendGrid 401: ${detail}. The API key is invalid or revoked.`;
  return `SendGrid error${status ? ` ${status}` : ""}: ${detail}`;
}

/** POST /v3/designs — store the HTML as a reusable design (editor: "code"). */
export async function createDesign(input: CreateDesignInput): Promise<CreatedDesign> {
  let body: unknown;
  try {
    [, body] = await getClient().request({
      method: "POST",
      url: "/v3/designs",
      body: {
        name: input.name,
        editor: "code", // we provide raw HTML, not the drag-and-drop tree
        html_content: input.html,
        subject: input.subject,
        generate_plain_content: true,
      },
    });
  } catch (err) {
    throw new Error(describeError(err));
  }

  const id = (body as { id?: string })?.id ?? "";
  return {
    id,
    name: input.name,
    editorUrl: id
      ? `https://mc.sendgrid.com/design-library/your-designs/${id}/edit`
      : "https://mc.sendgrid.com/design-library/your-designs",
  };
}

export interface CreatedTemplate {
  templateId: string;
  versionId: string;
  editorUrl: string;
}

/**
 * Create a Dynamic (transactional) Template:
 *   POST /v3/templates              { name, generation: "dynamic" }     -> template_id
 *   POST /v3/templates/{id}/versions { ..., active: 1 }                 -> version_id
 */
export async function createDynamicTemplate(input: CreateDesignInput): Promise<CreatedTemplate> {
  const c = getClient();
  let templateId = "";
  try {
    const [, tbody] = await c.request({
      method: "POST",
      url: "/v3/templates",
      body: { name: input.name, generation: "dynamic" },
    });
    templateId = (tbody as { id?: string })?.id ?? "";
  } catch (err) {
    throw new Error(describeError(err));
  }
  if (!templateId) throw new Error("SendGrid did not return a template id");

  let versionId = "";
  try {
    const [, vbody] = await c.request({
      method: "POST",
      url: `/v3/templates/${templateId}/versions`,
      body: {
        template_id: templateId,
        name: input.name,
        subject: input.subject,
        html_content: input.html,
        active: 1,
        generate_plain_content: true,
      },
    });
    versionId = (vbody as { id?: string })?.id ?? "";
  } catch (err) {
    throw new Error(describeError(err));
  }

  return {
    templateId,
    versionId,
    editorUrl: `https://mc.sendgrid.com/dynamic-templates/${templateId}/version/${versionId}/editor`,
  };
}
