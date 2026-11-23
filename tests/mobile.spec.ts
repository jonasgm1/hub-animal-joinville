import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("busca móvel, teclado, contato e acessibilidade das rotas principais", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pular para o conteúdo" }),
  ).toBeFocused();
  const form = page
    .locator("form")
    .filter({ has: page.locator("[name=q]") })
    .first();
  await form.locator("[name=q]").fill("castracao");
  await form.locator("button").click();
  await page
    .getByRole("link", { name: /Castração de cães e gatos/i })
    .first()
    .click();
  await expect(page.locator("main")).toContainText("CadÚnico");
  await expect(page.locator('main a[href*="wa.me"]').first()).toBeVisible();
  for (const path of [
    "/",
    "/servicos",
    "/servicos/castracao",
    "/agenda",
    "/organizacoes",
    "/enviar-evento",
    "/admin",
  ]) {
    await page.route("https://challenges.cloudflare.com/**", (r) => r.abort());
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      audit.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]),
    ).toEqual([]);
  }
});
test("envio e aprovação pelo navegador preservam os dados privados", async ({
  page,
}) => {
  await page.route("https://challenges.cloudflare.com/**", (r) => r.abort());
  await page.goto("/enviar-evento");
  const day = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
  for (const [k, v] of Object.entries({
    title: "Feira de validação móvel",
    location: "Local de teste em Joinville",
    organizer: "Organizador de teste",
    contact: "publico@example.test",
    start: day + "T10:00",
    end: day + "T15:00",
    description: "Feira para teste local.",
    sourceUrl: "https://example.test/evento",
    sender: "Pessoa de teste",
    private_contact: "privado@example.test",
  }))
    await page.locator('form [name="' + k + '"]').fill(v);
  await page.locator("select[name=type]").selectOption("Feira de adoção");
  await page.locator("[name=joinville]").check();
  await page.getByRole("button", { name: "Enviar para análise" }).click();
  await expect(page).toHaveURL(/envio-recebido/);
  await page.goto("/agenda");
  await expect(page.getByText("Feira de validação móvel")).toHaveCount(0);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Aprovar e publicar" }).click();
  await page.goto("/agenda");
  await page.getByRole("link", { name: "Feira de validação móvel" }).click();
  await expect(page.locator("main")).toContainText("publico@example.test");
  await expect(page.locator("body")).not.toContainText("privado@example.test");
});
