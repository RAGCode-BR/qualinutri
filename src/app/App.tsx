import { useEffect, useMemo, useState } from "react";
import { QuoteEditingContext, type QuoteEditingContextValue } from "./QuoteEditingContext";
import { useAuth } from "./AuthProvider";
import { CalculatorPage } from "../features/calculator/CalculatorPage";
import { CommercialPolicyPage } from "../features/commercial-policy/CommercialPolicyPage";
import { DiscountsPage } from "../features/discounts/DiscountsPage";
import { FreightPage } from "../features/freight/FreightPage";
import { ProductsPage } from "../features/pricing/ProductsPage";
import { AppHeader } from "../layouts/AppHeader";
import { AppSidebar, canAccessTab, tabLabels, type TabId } from "../layouts/AppSidebar";
import { PaymentTermsPage } from "../pages/PaymentTermsPage";
import { ProfilesPage } from "../features/auth/ProfilesPage";
import { CustomersPage } from "../features/customers/CustomersPage";
import { QuotesPage } from "../features/quotes/QuotesPage";
import { ReportsPage } from "../features/reports/ReportsPage";

const tabContent: Record<TabId, () => React.JSX.Element> = {
  calculator: CalculatorPage,
  discounts: DiscountsPage,
  terms: PaymentTermsPage,
  prices: ProductsPage,
  freight: FreightPage,
  policy: CommercialPolicyPage,
  customers: CustomersPage,
  quotes: QuotesPage,
  reports: ReportsPage,
  users: ProfilesPage,
};

export function App() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("calculator");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const ActivePage = tabContent[activeTab];

  useEffect(() => {
    if (!canAccessTab(activeTab, profile?.role)) setActiveTab("calculator");
  }, [activeTab, profile?.role]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  function changeTab(tab: TabId) {
    setActiveTab(tab);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const quoteEditing = useMemo<QuoteEditingContextValue>(() => ({
    pendingQuoteId,
    openQuoteForEditing: (quoteId) => {
      setPendingQuoteId(quoteId);
      changeTab("calculator");
    },
    clearPendingQuote: () => setPendingQuoteId(null),
  }), [pendingQuoteId]);

  return (
    <QuoteEditingContext.Provider value={quoteEditing}>
    <div className="app-layout">
      <AppSidebar activeTab={activeTab} open={menuOpen} onChange={changeTab} onClose={() => setMenuOpen(false)} />
      <div className="app-main">
        <AppHeader title={tabLabels[activeTab]} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />
        <main id={`panel-${activeTab}`} className={`page page-${activeTab}`} tabIndex={-1}>
          <ActivePage />
        </main>
      </div>
    </div>
    </QuoteEditingContext.Provider>
  );
}
