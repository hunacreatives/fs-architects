import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import PasswordGate from "./components/feature/PasswordGate";
import ScrollToTop from "./components/feature/ScrollToTop";
import PageTransition from "./components/feature/PageTransition";
import { AuthProvider } from "./contexts/AuthContext";
import { DemoProvider } from "./contexts/DemoContext";

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <DemoProvider>
          <PasswordGate>
            <BrowserRouter basename={__BASE_PATH__}>
              <ScrollToTop />
              <PageTransition>
                <AppRoutes />
              </PageTransition>
            </BrowserRouter>
          </PasswordGate>
        </DemoProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}

export default App;
