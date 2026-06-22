import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import ScrollToTop from "./components/feature/ScrollToTop";
import ScrollRestorer from "./components/feature/ScrollRestorer";
import PageTransition from "./components/feature/PageTransition";
import { AuthProvider } from "./contexts/AuthContext";
import { DemoProvider } from "./contexts/DemoContext";

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <DemoProvider>
          <BrowserRouter basename={__BASE_PATH__}>
            <ScrollRestorer />
            <ScrollToTop />
            <PageTransition>
              <AppRoutes />
            </PageTransition>
          </BrowserRouter>
        </DemoProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}

export default App;
