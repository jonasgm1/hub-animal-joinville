export const categories = [
  "Castração",
  "Vacinação",
  "Atendimento veterinário gratuito",
  "Adoção",
  "Feiras e campanhas",
  "Resgate de animais",
  "Denúncias de maus-tratos",
  "Animais desaparecidos",
  "Animais silvestres",
  "Zoonoses",
  "Apoio a protetores",
  "Voluntariado",
];
export const costs: Record<string, string> = {
  aberto: "Gratuito para o público elegível",
  criterios: "Gratuito mediante critérios",
  campanha: "Campanha eventual",
  disponibilidade: "Condicionado à disponibilidade",
  incerto: "Informação não confirmada",
};
export const eventTypes = [
  "Feira de adoção",
  "Campanha",
  "Mutirão",
  "Encontro",
];
export const tables = ["services", "organizations", "events"] as const;
export type Table = (typeof tables)[number];
export const paths = {
  services: "servicos",
  organizations: "organizacoes",
  events: "agenda",
} as const;
export interface Entry {
  slug: string;
  title: string;
  description: string;
  sourceUrl: string;
  verifiedAt: string;
  category?: string;
  species?: string[];
  cost?: string;
  audience?: string;
  eligibility?: string;
  address?: string;
  hours?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  steps?: string;
  documents?: string;
  organization?: string;
  area?: string;
  website?: string;
  volunteering?: string;
  projects?: string;
  social?: string;
  type?: string;
  start?: string;
  end?: string;
  location?: string;
  organizer?: string;
  contact?: string;
}
export interface Row {
  slug: string;
  data: string;
  status: "published" | "archived";
  revision: number;
}
export interface Env {
  DB: D1Database;
  ACCESS_TEAM?: string;
  ACCESS_AUD?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  RATE_SECRET?: string;
  PUBLIC_ORIGIN?: string;
}
export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const now = () => new Date().toISOString();
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const slugify = (s: string) => norm(s).replaceAll(" ", "-").slice(0, 90);
export function safeUrl(s: string) {
  try {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      Boolean(u.hostname.includes("."))
    );
  } catch {
    return false;
  }
}
export function localUTC(s: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s))
    throw new Problem(422, "Informe uma data e hora válidas em Joinville.");
  const d = new Date(s + ":00-03:00");
  if (
    !Number.isFinite(+d) ||
    new Date(+d - 3 * 3600000).toISOString().slice(0, 16) !== s
  )
    throw new Problem(422, "A data informada é inválida.");
  return d.toISOString();
}
export const localInput = (s?: string) =>
  s ? new Date(Date.parse(s) - 10800000).toISOString().slice(0, 16) : "";
export const dateLabel = (s: string, time = false) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "long",
    ...(time ? { timeStyle: "short" } : {}),
  }).format(new Date(s.length === 10 ? s + "T12:00:00Z" : s));
export const fingerprint = (e: Entry) =>
  [norm(e.title), e.start, norm(e.location || "")].join("|");
export function matchService(e: Entry, q: URLSearchParams) {
  const hay = norm(
    [
      e.title,
      e.description,
      e.category,
      e.steps,
      e.audience,
      e.eligibility,
      e.species?.join(" "),
    ].join(" "),
  );
  return (
    norm(q.get("q") || "")
      .split(" ")
      .every((w) => hay.includes(w)) &&
    (!q.get("categoria") || e.category === q.get("categoria")) &&
    (!q.get("especie") || e.species?.includes(q.get("especie")!)) &&
    (!q.get("acesso") || e.cost === q.get("acesso")) &&
    (!q.get("publico") || e.audience === q.get("publico"))
  );
}
export function field(f: FormData, key: string, max = 300, required = false) {
  const raw = f.get(key);
  if (raw !== null && typeof raw !== "string")
    throw new Problem(422, "Formato de campo inválido.");
  const s = (raw || "").trim().normalize("NFC");
  if (
    s.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(s) ||
    (required && !s)
  )
    throw new Problem(422, "Verifique o preenchimento do campo " + key + ".");
  return s;
}
export const isTable = (s: string): s is Table => tables.some((t) => t === s);
export function validateEntry(t: Table, e: Entry) {
  if (
    !e.title ||
    !e.description ||
    !safeUrl(e.sourceUrl) ||
    !/^\d{4}-\d\d-\d\d$/.test(e.verifiedAt) ||
    !Number.isFinite(Date.parse(e.verifiedAt)) ||
    new Date(e.verifiedAt).toISOString().slice(0, 10) !== e.verifiedAt ||
    e.verifiedAt > now().slice(0, 10) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.slug)
  )
    throw new Problem(
      422,
      "Confira nome, descrição, identificador, fonte HTTPS e data da verificação.",
    );
  if ([e.website, e.social].some((s) => s && !safeUrl(s)))
    throw new Problem(422, "Use um endereço HTTPS válido.");
  if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email))
    throw new Problem(422, "E-mail inválido.");
  if (
    t === "services" &&
    (!categories.includes(e.category || "") ||
      !Object.hasOwn(costs, e.cost || "") ||
      !e.eligibility ||
      !e.steps ||
      !e.audience)
  )
    throw new Problem(
      422,
      "Informe categoria, acesso, público, critérios e instruções.",
    );
  if (
    t === "events" &&
    (!eventTypes.includes(e.type || "") ||
      !e.start ||
      !e.end ||
      ![e.start, e.end].every(
        (d) =>
          /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(d) &&
          Number.isFinite(Date.parse(d)),
      ) ||
      Date.parse(e.end) <= Date.parse(e.start) ||
      !e.location ||
      !e.organizer ||
      !e.contact)
  )
    throw new Problem(
      422,
      "Confira o tipo, horário de início e fim, endereço, organizador e contato público.",
    );
}
