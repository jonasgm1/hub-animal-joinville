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
export const heading = (title: string, desc = "") =>
  `<header class="page-head"><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}</header>`;
export interface View {
  title: string;
  body: string;
  description?: string;
  structured?: object;
}
