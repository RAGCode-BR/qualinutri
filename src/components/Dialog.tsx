import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  size?: "small" | "medium";
  children: ReactNode;
};

/** Janela modal nativa: o navegador cuida do foco, do Esc e do fundo inerte. */
export function Dialog({ title, description, onClose, size = "medium", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog is-${size}`}
      aria-labelledby="dialogTitle"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
    >
      <div className="dialog-body">
        <header className="dialog-header">
          <h2 className="panel-title" id="dialogTitle">{title}</h2>
          {description && <p className="panel-description">{description}</p>}
        </header>
        {children}
      </div>
    </dialog>
  );
}
