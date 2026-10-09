import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { resetUserPassword } from "../../services/adminPasswordService";
import { createManagedUser, type CreateManagedUserInput } from "../../services/adminUserService";
import { listProfiles, updateProfileAccess } from "../../services/profileService";
import type { ProfileRole, UserProfile } from "../../types/auth";

const roleLabels: Record<ProfileRole, string> = {
  administrador: "Administrador",
  comercial: "Comercial",
  consulta: "Consulta",
};

const emptyUserForm: CreateManagedUserInput = {
  displayName: "",
  login: "",
  password: "",
  role: "consulta",
  active: true,
};

export function ProfilesPage() {
  const { profile: currentProfile, refreshProfile } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [userForm, setUserForm] = useState<CreateManagedUserInput>(emptyUserForm);
  const [resetProfile, setResetProfile] = useState<UserProfile | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [message, setMessage] = useState("");

  async function reloadProfiles() {
    setProfiles(await listProfiles());
  }

  useEffect(() => {
    reloadProfiles()
      .catch(() => setMessage("Não foi possível carregar os usuários."))
      .finally(() => setLoading(false));
  }, []);

  function userField<Key extends keyof CreateManagedUserInput>(key: Key, value: CreateManagedUserInput[Key]) {
    setUserForm((current) => ({ ...current, [key]: value }));
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setMessage("");
    try {
      await createManagedUser(userForm);
      setMessage(`Usuário ${userForm.login.trim().toLowerCase()} criado com sucesso.`);
      setUserForm(emptyUserForm);
      await reloadProfiles();
    } catch {
      setMessage("Não foi possível criar o usuário. Verifique se o login já existe e tente novamente.");
    } finally {
      setCreating(false);
    }
  }

  function changeProfile(id: string, changes: Partial<Pick<UserProfile, "role" | "active">>) {
    setProfiles((current) => current.map((profile) => profile.id === id ? { ...profile, ...changes } : profile));
  }

  async function save(profile: UserProfile) {
    if (savingId) return;
    setSavingId(profile.id);
    setMessage("");
    try {
      await updateProfileAccess(profile.id, profile.role, profile.active);
      if (profile.id === currentProfile?.id) await refreshProfile();
      setMessage(`Acesso de ${profile.login} atualizado.`);
    } catch {
      setMessage("Não foi possível atualizar o acesso. É necessário manter ao menos um administrador ativo.");
    } finally {
      setSavingId(null);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!resetProfile || resettingPassword) return;
    setResettingPassword(true);
    setMessage("");
    try {
      await resetUserPassword(resetProfile.id, temporaryPassword);
      setMessage(`Senha de ${resetProfile.login} redefinida. A troca será exigida no próximo acesso.`);
      setResetProfile(null);
      setTemporaryPassword("");
      await reloadProfiles();
    } catch {
      setMessage("Não foi possível redefinir a senha temporária.");
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <div className="page-columns is-form-first">
      <div className="aside-panel">
        {resetProfile ? (
          <Panel title={`Redefinir senha de ${resetProfile.login}`} description="O usuário terá que trocar esta senha temporária no próximo acesso." className="is-editing">
            <form onSubmit={resetPassword}>
              <div className="field"><label htmlFor="resetTemporaryPassword">Nova senha temporária</label>
                <input id="resetTemporaryPassword" type="password" required minLength={6} autoComplete="new-password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /></div>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={resettingPassword}>{resettingPassword ? "Redefinindo…" : "Redefinir senha"}</button>
                <button type="button" className="secondary-button" disabled={resettingPassword} onClick={() => { setResetProfile(null); setTemporaryPassword(""); }}>Cancelar</button>
              </div>
            </form>
          </Panel>
        ) : (
          <Panel title="Novo usuário" description="O usuário define a própria senha no primeiro acesso.">
            <form onSubmit={createUser}>
              <div className="field"><label htmlFor="newUserName">Nome</label><input id="newUserName" required maxLength={120} autoComplete="off" value={userForm.displayName} onChange={(event) => userField("displayName", event.target.value)} /></div>
              <div className="field"><label htmlFor="newUserLogin">Login</label><input id="newUserLogin" type="text" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" autoComplete="off" aria-describedby="newUserLoginHint" value={userForm.login} onChange={(event) => userField("login", event.target.value)} />
                <p className="field-hint" id="newUserLoginHint">De 3 a 32 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.</p></div>
              <div className="field"><label htmlFor="newUserPassword">Senha temporária</label><input id="newUserPassword" type="password" required minLength={6} autoComplete="new-password" value={userForm.password} onChange={(event) => userField("password", event.target.value)} /></div>
              <div className="field"><label htmlFor="newUserRole">Perfil</label><select id="newUserRole" value={userForm.role} onChange={(event) => userField("role", event.target.value as ProfileRole)}>
                {(Object.keys(roleLabels) as ProfileRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </select></div>
              <label className="check-field field-spaced"><input type="checkbox" checked={userForm.active} onChange={(event) => userField("active", event.target.checked)} /><span>Usuário ativo</span></label>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={creating}>{creating ? "Criando…" : "Criar usuário"}</button>
              </div>
            </form>
          </Panel>
        )}
      </div>
      <Panel title="Usuários e permissões" description="Altere o perfil ou a situação de um acesso e clique em Salvar na mesma linha." flush>
        {message && <p role="status" className="form-message panel-message">{message}</p>}
        {loading ? <p className="panel-loading">Carregando usuários…</p> : (
          <ScrollableTable><table className="data-table users-table stack-table">
            <thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">Senha</th><th scope="col">Ativo</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{profiles.map((profile) => (
              <tr key={profile.id} className={resetProfile?.id === profile.id ? "is-editing" : undefined}>
                <td className="cell-primary"><span className="strong">{profile.displayName || "Sem nome"}</span><span className="cell-sub">{profile.login}</span></td>
                <td data-label="Perfil"><select className="compact-select" aria-label={`Perfil de ${profile.login}`} value={profile.role} onChange={(event) => changeProfile(profile.id, { role: event.target.value as ProfileRole })}>
                  {(Object.keys(roleLabels) as ProfileRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select></td>
                <td data-label="Senha">{profile.mustChangePassword ? <span className="status-badge is-warning">Troca pendente</span> : <span className="status-badge is-approved">Definida</span>}</td>
                <td data-label="Ativo"><input className="table-checkbox" aria-label={`Ativar ${profile.login}`} type="checkbox" checked={profile.active} onChange={(event) => changeProfile(profile.id, { active: event.target.checked })} /></td>
                <td className="action-cell"><button type="button" className="row-button" disabled={savingId !== null} onClick={() => void save(profile)}>{savingId === profile.id ? "Salvando…" : "Salvar"}</button><button type="button" className="row-button" disabled={profile.id === currentProfile?.id} title={profile.id === currentProfile?.id ? "Use outro administrador para redefinir sua senha." : undefined} onClick={() => { setResetProfile(profile); setTemporaryPassword(""); }}>Redefinir senha</button></td>
              </tr>
            ))}</tbody>
          </table></ScrollableTable>
        )}
      </Panel>
    </div>
  );
}
