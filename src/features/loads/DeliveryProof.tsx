import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Dialog } from "../../components/Dialog";
import { getDeliveryProof, recordDelivery, type DeliveryRoute, type DeliveryStop } from "../../services/logisticsService";

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("Escolha uma imagem de até 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.75);
  } catch {
    throw new Error("Não foi possível ler a foto. Escolha um arquivo JPEG ou PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DeliveryProof({ route, stop, onClose, onSaved }: {
  route: DeliveryRoute; stop: DeliveryStop; onClose: () => void; onSaved: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const [signed, setSigned] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proof, setProof] = useState<{ signature: string; photo: string } | null>(null);

  useEffect(() => {
    if (!stop.delivered_at) return;
    let active = true;
    getDeliveryProof(route.id, stop.stop_order).then((data) => { if (active) setProof(data); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [route.id, stop.stop_order, stop.delivered_at]);

  function draw(event: PointerEvent<HTMLCanvasElement>, start: boolean) {
    if (busy || (start ? pointer.current !== null || event.button !== 0 : pointer.current !== event.pointerId)) return;
    const surface = event.currentTarget;
    const context = surface.getContext("2d")!;
    const bounds = surface.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * surface.width / bounds.width;
    const y = (event.clientY - bounds.top) * surface.height / bounds.height;
    if (start) {
      pointer.current = event.pointerId;
      surface.setPointerCapture(event.pointerId);
      context.beginPath();
      context.moveTo(x, y);
    } else {
      context.lineWidth = 3;
      context.lineCap = "round";
      context.strokeStyle = "#18251d";
      context.lineTo(x, y);
      context.stroke();
      setSigned(true);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!signed || !photo || receiver.trim().length < 2) return setError("Informe o recebedor, colha a assinatura e selecione uma foto.");
    setBusy(true);
    setError("");
    try {
      const signature = canvas.current!.toDataURL("image/png");
      const photoData = await compressPhoto(photo);
      await recordDelivery(route.id, stop.stop_order, receiver, signature, photoData);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gravar o comprovante.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Comprovação · ${stop.customer_name}`} onClose={() => { if (!busy) onClose(); }}>
      {stop.delivered_at ? (
        proof ? <div className="delivery-evidence">
          <p>Recebido por {stop.receiver_name}</p>
          <img src={proof.signature} alt="Assinatura do recebedor" />
          <img src={proof.photo} alt="Foto da entrega" />
        </div> : !error && <p role="status">Abrindo o comprovante…</p>
      ) : (
        <form className="delivery-proof-form" onSubmit={(event) => void save(event)}>
          <label className="field">Nome do recebedor<input maxLength={120} value={receiver} disabled={busy} onChange={(event) => setReceiver(event.target.value)} required /></label>
          <label htmlFor="delivery-signature">Assinatura do recebedor</label>
          <canvas id="delivery-signature" aria-label="Área para assinar com o dedo ou mouse" className="delivery-signature" ref={canvas} width={600} height={220}
            onPointerDown={(event) => draw(event, true)} onPointerMove={(event) => draw(event, false)}
            onLostPointerCapture={() => { pointer.current = null; }} />
          <button type="button" className="secondary-button" disabled={busy} onClick={() => {
            const surface = canvas.current!;
            surface.getContext("2d")?.clearRect(0, 0, surface.width, surface.height);
            setSigned(false);
          }}>Limpar assinatura</button>
          <label className="field">Foto da entrega<input type="file" accept="image/*" capture="environment" required disabled={busy} onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Salvando…" : "Registrar entrega"}</button>
        </form>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </Dialog>
  );
}
