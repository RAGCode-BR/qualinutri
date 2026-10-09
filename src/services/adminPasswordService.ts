import { supabase } from "../lib/supabase";

export class AdminPasswordServiceError extends Error {
  constructor(message = "Não foi possível redefinir a senha.") {
    super(message);
    this.name = "AdminPasswordServiceError";
  }
}

export async function resetUserPassword(userId: string, temporaryPassword: string): Promise<void> {
  if (!supabase) throw new AdminPasswordServiceError("A conexão com o Supabase não está configurada.");
  const { error } = await supabase.functions.invoke("reset-user-password", {
    body: { userId, temporaryPassword },
  });
  if (error) throw new AdminPasswordServiceError();
}
