import { useTranslations } from "next-intl";

export function Hero() {
  const t = useTranslations();
  return (
    <section>
      <h1>{t("hero.title")}</h1>
      <p title={t("hero.subtitle")}>{t("hero.subtitle")}</p>
      <button>{t("hero.cta")}</button>
      <nav>
        <a href="/">{t("nav.home")}</a>
        <a href="/pricing">{t("nav.pricing")}</a>
        <button>{t("nav.signIn")}</button>
      </nav>
    </section>
  );
}
