import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react';
import { api } from '../services/api';
import type { AdminUser, ManagedUser, UserRole } from '../services/api';

const roleOptions: { id: UserRole; name: string; description: string }[] = [
  { id: 'ADMIN', name: 'Administrador', description: 'Acesso completo, incluindo usuários, mapa e reboot' },
  { id: 'OPERADOR', name: 'Operador', description: 'Consulta, exportação CSV e reinício do coletor' },
  { id: 'VISUALIZADOR', name: 'Visualizador', description: 'Somente consultas e monitoramento' },
];

function roleLabel(role: string) {
  return roleOptions.find((item) => item.id === role)?.name ?? role;
}

function UserRow({
  user, currentUserId, onSaved, onError, onReset,
}: {
  user: ManagedUser;
  currentUserId: string;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
  onReset: (user: ManagedUser) => Promise<void>;
}) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [busy, setBusy] = useState(false);
  const own = user.id === currentUserId;

  useEffect(() => { setRole(user.role); }, [user.role]);

  async function saveRole() {
    if (own || role === user.role) return;
    setBusy(true); onError('');
    try {
      await api.updateUser(user.id, { role });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Não foi possível alterar o perfil');
    } finally { setBusy(false); }
  }

  async function toggleActive() {
    if (own) return;
    if (user.active && !window.confirm(`Desativar ${user.username}? As sessões serão encerradas imediatamente.`)) return;
    setBusy(true); onError('');
    try {
      await api.updateUser(user.id, { active: !user.active });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Não foi possível alterar o usuário');
    } finally { setBusy(false); }
  }

  return (
    <article className={`user-account-row ${user.active ? '' : 'inactive'}`}>
      <div className="user-account-identification">
        <div className="user-account-avatar">{user.username.slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{user.username}</strong>
          <div className="user-account-status">
            <span className={`status-chip ${user.active ? 'success' : 'danger'}`}><span />{user.active ? 'Ativo' : 'Desativado'}</span>
            {user.mustChangePassword && <span className="user-password-pending">Senha inicial pendente</span>}
            {own && <span className="user-current-tag">Sua conta</span>}
          </div>
        </div>
      </div>

      <div className="user-account-controls">
        <label className="user-role-select">Perfil de acesso
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}
            disabled={own || busy} aria-label={`Perfil de ${user.username}`}>
            {roleOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {!own && <div className="user-account-actions">
          <button type="button" className="outline-button" disabled={busy || role === user.role}
            onClick={() => { void saveRole(); }}>Salvar perfil</button>
          <button type="button" className="outline-button" disabled={busy}
            title={`Gerar nova senha provisória para ${user.username}`}
            onClick={() => { void onReset(user); }}><KeyRound size={15}/> Redefinir senha</button>
          <button type="button" className={`outline-button ${user.active ? 'danger-button' : ''}`}
            disabled={busy} onClick={() => { void toggleActive(); }}>
            {user.active ? <UserRoundX size={15}/> : <UserRoundCheck size={15}/>}
            {user.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>}
      </div>
    </article>
  );
}

export function UserManagement({ currentUser }: { currentUser: AdminUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('VISUALIZADOR');
  const [temporary, setTemporary] = useState<{ username: string; password: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let alive = true;
    api.users().then((result) => { if (alive) setUsers(result); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Falha ao consultar usuários'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function refreshUsers() {
    const result = await api.users();
    setUsers(result);
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess(''); setTemporary(null);
    try {
      const created = await api.createUser(username.trim().toLowerCase(), role);
      await refreshUsers();
      setTemporary({ username: created.user.username, password: created.temporaryPassword });
      setUsername('');
      setRole('VISUALIZADOR');
      setSuccess(`Conta ${created.user.username} criada. Compartilhe a senha provisória por um canal seguro.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuário');
    } finally { setBusy(false); }
  }

  async function resetPassword(user: ManagedUser) {
    if (!window.confirm(`Redefinir senha de ${user.username}? Todas as sessões atuais serão encerradas.`)) return;
    setBusy(true); setError(''); setSuccess(''); setTemporary(null);
    try {
      const response = await api.resetUserPassword(user.id);
      await refreshUsers();
      setTemporary({ username: response.user.username, password: response.temporaryPassword });
      setSuccess('Senha provisória gerada. Ela será exibida somente aqui.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao redefinir senha');
    } finally { setBusy(false); }
  }

  async function copyPassword() {
    if (!temporary) return;
    try {
      if (!navigator.clipboard) throw Error('Cópia automática não disponível neste navegador');
      await navigator.clipboard.writeText(temporary.password);
      setSuccess('Senha provisória copiada.');
    } catch {
      setSuccess('Selecione a senha no campo e copie manualmente.');
    }
  }

  return <div className="user-management">
    <div className="user-management-intro">
      <div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>Contas e permissões</h2>
        <p>Cadastre usuários com permissões específicas. Senhas são geradas pelo servidor e exigem alteração no primeiro login.</p></div>
      <button className="outline-button" type="button" onClick={() => { setError(''); void refreshUsers().catch((err) => setError(err instanceof Error ? err.message : 'Falha ao atualizar')); }}>
        <RefreshCw size={16}/> Atualizar
      </button>
    </div>

    {error && <div className="error-box" role="alert">{error}</div>}
    {success && <div className="notice-box" role="status"><CheckCircle2 size={16}/>{success}</div>}

    {temporary && <section className="card temporary-credentials" aria-label="Credenciais temporárias">
      <div className="temporary-credentials-head"><ShieldCheck size={20}/><div>
        <h3>Credenciais provisórias de {temporary.username}</h3>
        <p>A senha só é exibida agora e não pode ser recuperada depois. Guarde-a antes de fechar este aviso.</p>
      </div></div>
      <div className="temporary-password-field">
        <input aria-label="Senha temporária" type="text" readOnly value={temporary.password} onFocus={(event) => event.target.select()}/>
        <button type="button" className="outline-button" onClick={() => { void copyPassword(); }}><Copy size={16}/> Copiar</button>
      </div>
      <button type="button" className="text-button" onClick={() => setTemporary(null)}>Já guardei a senha</button>
    </section>}

    <section className="card user-create-card">
      <div className="section-heading"><div><h2>Novo usuário</h2>
        <p>A nova conta começa ativa com uma senha temporária e troca obrigatória no primeiro acesso.</p></div><Plus size={22}/></div>
      <form onSubmit={(event) => { void createUser(event); }} className="user-create-form">
        <label>Nome de usuário
          <input value={username} minLength={3} maxLength={50} required autoComplete="off"
            pattern="[a-zA-Z][a-zA-Z0-9._-]*" placeholder="ex.: operador.e01"
            onChange={(event) => setUsername(event.target.value)}/>
        </label>
        <label>Perfil
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            {roleOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={busy || !username.trim()}>
          <Plus size={17}/>{busy ? 'Criando...' : 'Criar usuário'}
        </button>
      </form>
      <div className="user-role-guide">
        {roleOptions.map((item) => <div key={item.id}><strong>{item.name}</strong><span>{item.description}</span></div>)}
      </div>
    </section>

    <section className="card user-list-card">
      <div className="section-heading"><div><h2>Usuários cadastrados</h2>
        <p>{users.length} conta(s) · somente administradores podem alterar perfis e credenciais.</p></div></div>
      {loading ? <p className="muted">Carregando contas...</p> :
        users.length === 0 ? <p className="muted">Nenhuma conta encontrada.</p>
          : <div className="user-account-list">{users.map((user) =>
              <UserRow key={user.id} user={user} currentUserId={currentUser.id}
                onSaved={async () => { await refreshUsers(); setSuccess('Conta atualizada com sucesso.'); }}
                onError={setError}
                onReset={resetPassword}/>)}</div>}
      <p className="muted">O último administrador ativo não pode ser desativado ou rebaixado. A própria conta deve trocar a senha em Configurações.</p>
    </section>
  </div>;
}
