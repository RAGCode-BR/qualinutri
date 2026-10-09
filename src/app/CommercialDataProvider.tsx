import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { localCommercialData } from "../data/commercialData";
import { isSupabaseConfigured } from "../lib/supabase";
import { invalidateCommercialData, loadCommercialData } from "../services/commercialDataService";
import type { CommercialData } from "../types/commercial";

type CommercialDataContextValue = {
  data: CommercialData;
  source: "local" | "supabase";
  loading: boolean;
  message: string;
  reload: () => void;
};

const CommercialDataContext = createContext<CommercialDataContextValue | null>(null);

/** Intervalo entre conferências automáticas de preços e descontos. */
const REFRESH_INTERVAL_MS = 5 * 60_000;
/** Ao voltar para a aba, só confere de novo se a última conferência tiver mais de 1 minuto. */
const REFRESH_ON_FOCUS_AFTER_MS = 60_000;

export function CommercialDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(localCommercialData);
  const [source, setSource] = useState<"local" | "supabase">("local");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [message, setMessage] = useState(
    isSupabaseConfigured
      ? "Atualizando dados comerciais…"
      : "Configuração do Supabase ausente. Os dados locais estão em uso.",
  );
  const [requestVersion, setRequestVersion] = useState(0);
  const lastFetchAt = useRef(0);
  const refreshing = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setLoading(true);
    setMessage("Atualizando dados comerciais…");

    lastFetchAt.current = Date.now();
    loadCommercialData()
      .then((remoteData) => {
        if (!active) return;
        setData(remoteData);
        setSource("supabase");
        setMessage("Dados comerciais carregados do Supabase.");
      })
      .catch(() => {
        if (!active) return;
        setData(localCommercialData);
        setSource("local");
        setMessage("Dados locais em uso. Não foi possível atualizar os dados comerciais do Supabase.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [requestVersion]);

  // Conferência silenciosa: descontos e preços alterados por um administrador
  // chegam aos outros usuários sem recarregar a página. Só troca os dados se
  // algo mudou; se falhar, mantém o que já está na tela.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    async function refreshSilently() {
      if (refreshing.current || document.visibilityState !== "visible") return;
      refreshing.current = true;
      lastFetchAt.current = Date.now();
      try {
        invalidateCommercialData();
        const remoteData = await loadCommercialData();
        setData((current) => JSON.stringify(current) === JSON.stringify(remoteData) ? current : remoteData);
        setSource("supabase");
        setMessage("Dados comerciais carregados do Supabase.");
      } catch {
        // Mantém os dados atuais; a próxima conferência tenta de novo.
      } finally {
        refreshing.current = false;
      }
    }

    const interval = window.setInterval(() => { void refreshSilently(); }, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetchAt.current > REFRESH_ON_FOCUS_AFTER_MS) {
        void refreshSilently();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const value = useMemo<CommercialDataContextValue>(() => ({
    data,
    source,
    loading,
    message,
    reload: () => {
      if (loading) return;
      invalidateCommercialData();
      setRequestVersion((current) => current + 1);
    },
  }), [data, loading, message, source]);

  return <CommercialDataContext.Provider value={value}>{children}</CommercialDataContext.Provider>;
}

export function useCommercialData() {
  const value = useContext(CommercialDataContext);
  if (!value) throw new Error("useCommercialData deve ser usado dentro de CommercialDataProvider.");
  return value;
}
