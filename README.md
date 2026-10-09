# Qualinutri — Calculadora & Política Comercial

Aplicação interna para consulta da política comercial, cálculo de pedidos e gestão de clientes e orçamentos. A migração preserva o comportamento do sistema legado e separa interface, domínio financeiro e persistência.

## Tecnologias

- React 19, TypeScript e Vite;
- Vitest para testes de caracterização;
- Supabase Auth, Postgres e Row Level Security;
- migrations SQL versionadas em `supabase/migrations`.

## Configuração local

Requisitos: Node.js compatível com Vite 8 e acesso ao projeto Supabase.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Preencha `.env.local` com a URL e a chave pública do projeto. Nunca use `service_role` ou outra chave secreta no frontend.

## Acesso e usuários

O acesso usa login e senha; nenhum e-mail pessoal é solicitado. O login aceita de 3 a 32 caracteres, usando letras sem acento, números, ponto, hífen ou sublinhado.

O cadastro público está desabilitado. Novas contas são criadas exclusivamente por um administrador autenticado, na área **Usuários e permissões**, com nome, login, senha temporária, perfil e estado ativo/inativo.

No primeiro login, o usuário fica restrito à tela de definição de senha. A aplicação só é liberada depois que ele informa e confirma sua própria senha.

Se um usuário esquecer a senha, um administrador pode selecionar **Redefinir senha** na listagem, informar uma nova senha temporária e devolver o acesso. O mesmo fluxo obrigatório de definição de senha permanente será apresentado no login seguinte.

Papéis disponíveis:

- `administrador`: usuários, dados comerciais, clientes e orçamentos;
- `comercial`: clientes e orçamentos;
- `consulta`: catálogo, tabelas e política.

O banco impede que o último administrador ativo seja desativado, rebaixado ou excluído.

## Verificação

```bash
npm run check
```

Esse comando executa os testes de caracterização, a verificação TypeScript e o build de produção. As fórmulas financeiras são protegidas por testes em `tests/characterization`.

## Supabase

Para operações da CLI, copie `.env.supabase-cli.example` para `.env.supabase-cli`, informe um token com escopo para este projeto e restrinja o arquivo ao usuário local:

```bash
chmod 600 .env.local .env.supabase-cli
npm run db:push:dry
npm run db:lint
```

Scripts disponíveis:

- `npm run db:push`: aplica migrations pendentes no projeto vinculado;
- `npm run db:types`: regenera os tipos TypeScript do schema remoto;
- `npm run db:seed:generate`: regenera `supabase/seed.sql` a partir do snapshot comercial versionado.

## Referências

- `src/data/commercial-snapshot.json`: snapshot versionado dos dados extraídos do sistema legado;
- `src/ARCHITECTURE.md`: organização da aplicação;
- `docs/supabase-data-model.md`: modelagem e decisões do banco;
- `tests/characterization/README.md`: regras atuais preservadas e inconsistências conhecidas.
