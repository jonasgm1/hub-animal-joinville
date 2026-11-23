import {
  type Table,
  type Entry,
  field,
  slugify,
  localUTC,
  now,
  validateEntry,
  Problem,
} from "./model";
export const common = ["title", "description", "sourceUrl"] as const;
export const extras = {
  services: [
    "category",
    "cost",
    "audience",
    "eligibility",
    "address",
    "hours",
    "phone",
    "whatsapp",
    "email",
    "steps",
    "documents",
    "organization",
    "website",
  ],
  organizations: [
    "area",
    "address",
    "hours",
    "phone",
    "whatsapp",
    "email",
    "website",
    "volunteering",
    "projects",
    "social",
  ],
  events: ["type", "location", "organizer", "contact", "organization"],
} as const;
export const labels: Record<string, string> = {
  title: "Nome",
  description: "Descrição",
  sourceUrl: "Link da publicação original",
  verifiedAt: "Data da verificação",
  category: "Categoria",
  cost: "Condição de acesso",
  audience: "Público atendido",
  eligibility: "Critérios de acesso",
  address: "Endereço",
  hours: "Horário de atendimento",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  steps: "Como solicitar",
  documents: "Documentos necessários",
  organization: "Organização vinculada",
  website: "Site ou canal de solicitação",
  area: "Área de atuação",
  volunteering: "Como ser voluntário",
  projects: "Projetos e campanhas",
  social: "Rede social",
  type: "Tipo de evento",
  location: "Endereço completo em Joinville",
  organizer: "Organizador",
  contact: "Contato público do evento",
  start: "Início",
  end: "Término",
  species: "Espécies (separadas por vírgula)",
  sender: "Seu nome",
  private_contact: "Seu e-mail privado",
};
export function fromForm(
  t: Table,
  f: FormData,
  slug?: string,
  submission = false,
): Entry {
  const title = field(f, "title", 160, true),
    result: Record<string, unknown> = {
      slug: slug || slugify(title),
      verifiedAt: submission
        ? now().slice(0, 10)
        : field(f, "verifiedAt", 10, true),
    };
  for (const k of [...common, ...extras[t]]) {
    if (submission && k === "organization") continue;
    const s = field(
      f,
      k,
      [
        "description",
        "steps",
        "eligibility",
        "documents",
        "projects",
        "volunteering",
      ].includes(k)
        ? 2500
        : 500,
    );
    if (s) result[k] = s;
  }
  if (t === "events") {
    result.start = localUTC(field(f, "start", 16, true));
    result.end = localUTC(field(f, "end", 16, true));
    if (!slug)
      result.slug =
        slugify(title) +
        "-" +
        String(result.start).slice(0, 10) +
        "-" +
        crypto.randomUUID().slice(0, 6);
    if (submission && (result.end as string) <= now())
      throw new Problem(422, "O evento já terminou.");
    if (field(f, "joinville") !== "sim")
      throw new Problem(422, "Confirme que o evento ocorre em Joinville.");
  }
  if (t === "services")
    result.species = field(f, "species", 150)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const e = result as unknown as Entry;
  validateEntry(t, e);
  return e;
}
