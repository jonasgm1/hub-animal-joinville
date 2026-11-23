import {
  type Entry,
  type Table,
  categories,
  costs,
  eventTypes,
  localInput,
  now,
} from "./model";
import { extras, labels } from "./fields";
export const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const link = (href: string, label: string) =>
  `<a href="${esc(href)}">${esc(label)}</a>`;
export const hidden = (k: string, v: unknown) =>
  `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`;
export const heading = (title: string, desc = "") =>
  `<header class="page-head"><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}</header>`;
export const post = (url: string, body: string) =>
  `<form method="post" action="${esc(url)}">${body}</form>`;
export interface View {
  title: string;
  body: string;
  description?: string;
  structured?: object;
}
export const names: Record<Table, string> = {
  services: "Serviços",
  organizations: "Organizações",
  events: "Eventos",
};
type Choices = readonly (string | readonly [string, string])[];
function input(k: string, val: unknown, required: boolean, choices?: Choices) {
  const name = esc(k),
    v = esc(val),
    attrs = ` name="${name}"${required ? " required" : ""}`;
  let control;
  if (choices)
    control = `<select${attrs}><option value="">Escolha</option>${choices
      .map((o) => {
        const [key, label] = typeof o === "string" ? [o, o] : o;
        return `<option value="${esc(key)}"${val === key ? " selected" : ""}>${esc(label)}</option>`;
      })
      .join("")}</select>`;
  else if (
    [
      "description",
      "eligibility",
      "steps",
      "documents",
      "projects",
      "volunteering",
    ].includes(k)
  )
    control = `<textarea${attrs} maxlength="2500">${v}</textarea>`;
  else {
    const type =
      (
        {
          email: "email",
          private_contact: "email",
          sourceUrl: "url",
          website: "url",
          social: "url",
          start: "datetime-local",
          end: "datetime-local",
          verifiedAt: "date",
        } as Record<string, string>
      )[k] || "text";
    control = `<input${attrs} type="${type}" value="${v}" maxlength="${k === "title" ? 160 : 500}">`;
  }
  return `<label>${esc(labels[k])}${required ? " *" : ""}${control}</label>`;
}
export function editor(
  t: Table,
  e: Partial<Entry> = {},
  orgs: Entry[] = [],
  submission = false,
) {
  const opts: Record<string, Choices> = {
    type: eventTypes,
    category: categories,
    cost: Object.entries(costs),
    organization: orgs.map((o) => [o.slug, o.title]),
  };
  const values: Record<string, unknown> = {
    ...e,
    verifiedAt: e.verifiedAt || now().slice(0, 10),
    start: localInput(e.start),
    end: localInput(e.end),
    species: e.species?.join(", "),
  };
  const keys = [
    "title",
    ...extras[t].filter((k) => !submission || k !== "organization"),
    ...(t === "events" ? ["start", "end"] : []),
    ...(t === "services" ? ["species"] : []),
    "description",
    "sourceUrl",
    ...(submission ? [] : ["verifiedAt"]),
  ];
  const required = [
    "title",
    "type",
    "contact",
    "location",
    "organizer",
    "start",
    "end",
    "description",
    "sourceUrl",
    "verifiedAt",
    "category",
    "cost",
    "audience",
    "eligibility",
    "steps",
  ];
  return `<p>Campos com * são obrigatórios.${t === "events" ? " Horários de Joinville." : ""}</p><div class="form-grid">${keys.map((k) => input(k, values[k], required.includes(k), opts[k])).join("")}</div>${t === "events" ? '<label class="confirm"><input type="checkbox" name="joinville" value="sim" required> Confirmo que o evento acontece em Joinville/SC. *</label>' : ""}`;
}
export function submissionForm(siteKey?: string) {
  return (
    heading(
      "Divulgar um evento",
      "Envie uma feira, campanha ou mutirão de proteção animal em Joinville. A equipe confere a publicação original antes de incluir a atividade na agenda.",
    ) +
    (!siteKey
      ? '<p class="notice" role="status">O recebimento de novos eventos está temporariamente indisponível. Você pode consultar a agenda já publicada.</p>'
      : "") +
    post(
      "/enviar-evento",
      "<fieldset><legend>Dados públicos do evento</legend>" +
        editor("events", {}, [], true) +
        '</fieldset><fieldset><legend>Responsável pelo envio</legend><p>Somente a moderação terá acesso a estes dados. Eles são apagados após a decisão ou em até 30 dias.</p><div class="form-grid">' +
        input("sender", "", true) +
        input("private_contact", "", true) +
        "</div></fieldset>" +
        (siteKey
          ? `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-action="enviar_evento"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
          : "") +
        `<p><a href="/privacidade">Como tratamos seus dados</a></p><button${siteKey ? "" : " disabled"}>Enviar para análise</button>`,
    )
  );
}
