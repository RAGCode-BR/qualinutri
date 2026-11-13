import { useEffect, useRef, useState } from "react";
import type { BoxPosition, CargoBox, CargoSpace } from "../../domain/loads/loadLayout";

export type YardManifest = { id: string; vehicle: CargoSpace; boxes: CargoBox[]; positions: BoxPosition[] };

export function LoadYard({ manifest, onLayout }: {
  manifest: YardManifest;
  onLayout: (positions: BoxPosition[]) => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === "qualinutri:ready") {
        setStatus("ready");
        iframe.current?.contentWindow?.postMessage({ type: "qualinutri:manifest", ...manifest }, window.location.origin);
      }
      if (event.data?.type === "qualinutri:unavailable") setStatus("unavailable");
      if (event.data?.type === "qualinutri:layout" && event.data.revision === manifest.id && Array.isArray(event.data.boxes)) {
        onLayout(event.data.boxes);
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [manifest, onLayout]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setStatus("unavailable"), 12000);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <>
      {status === "loading" && <p role="status">Abrindo o pátio 3D…</p>}
      {status === "unavailable" && <p role="alert">O pátio 3D não abriu. Reabra a montagem em um navegador com WebGL habilitado.</p>}
      <iframe
        ref={iframe}
        className="load-yard"
        src={`${import.meta.env.BASE_URL}load-simulator${import.meta.env.DEV ? ".html" : ""}`}
        title="Pátio de carga 3D"
        referrerPolicy="same-origin"
        hidden={status === "unavailable"}
      />
    </>
  );
}
