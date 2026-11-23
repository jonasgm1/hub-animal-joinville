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
    "/sobre",
    "/privacidade",
  ]) {
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
