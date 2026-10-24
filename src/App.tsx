import { HomePage } from "./pages/HomePage";
import { AdminPage } from "./pages/AdminPage";

export default function App() {
  return window.location.pathname.replace(/\/+$/, "") === "/admin" ? (
    <AdminPage />
  ) : (
    <HomePage />
  );
}
