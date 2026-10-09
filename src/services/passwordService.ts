import { supabase } from "../lib/supabase";

export class PasswordServiceError extends Error {
  constructor(message = "Não foi possível alterar a senha.") {
    super(message);
    this.name = "PasswordServiceError";
  }
}

export async function changeInitialPassword(password: string): Promise<void> {
  if (!supabase) throw new PasswordServiceError("A conexão com o Supabase não está configurada.");
  const { error } = await supabase.functions.invoke("change-initial-password", {
    body: { password },
  });
  if (error) throw new PasswordServiceError();
}
