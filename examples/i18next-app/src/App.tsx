import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t("greeting", { name: "Ada" })}</h1>
      <button>{t("buttons.save")}</button>
      <button>{t("buttons.cancel")}</button>
      <p>{t("messages.unread", { count: 3 })}</p>
    </div>
  );
}
