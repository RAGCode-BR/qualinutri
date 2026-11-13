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

## Logística

Em **Logística → Montagem de carga**, escolha a data e um veículo com as medidas internas cadastradas, adicione pedidos aprovados em sacas soltas e abra o pátio 3D. Informe as medidas por produto, confirme os endereços e posicione os volumes. A faixa mais próxima da traseira será descarregada primeiro. A montagem usa 5% de reserva de peso e 5 cm de folga na altura.

Ao fechar a carga, as ordens por destino ficam disponíveis para impressão e PDF. O roteiro usa os endereços na sequência de descarga. Selecione uma conta ativa para o motorista. Depois de expedida, a carga aparece em **Minhas entregas** para a conta de consulta atribuída e permite registrar assinatura e foto por destino.

As medidas de sacas e as conferências de estoque e crédito são informadas na montagem. Para automatizá-las, conecte as fontes de cadastro físico, estoque, produção e financeiro. A view `load_fiscal_destinations` disponibiliza os dados das cargas expedidas para uma futura integração MDF-e no servidor.

A migração `20261113130000_load_logistics.sql` deve ser aplicada ao Supabase do Qualinutri antes de publicar esta versão do frontend.

## Verificação

```bash
npm run check
```

Esse comando executa os testes, a verificação TypeScript, o build de produção e uma checagem para impedir que o catálogo comercial de referência apareça no JavaScript público. As fórmulas financeiras são protegidas por testes em `tests/characterization`.

## Deploy na Cloudflare

O sistema é publicado como site estático em **Cloudflare Workers**, com deploy automático a cada envio para o GitHub. A configuração fica em `wrangler.jsonc`, e os cabeçalhos de segurança e de cache em `public/_headers`.

### Primeira configuração

1. Crie um repositório no GitHub e envie o projeto. `.env.local`, `.env.supabase-cli` e as pastas locais já estão no `.gitignore`.
2. No painel da Cloudflare, abra **Workers & Pages → Create → Import a repository** e escolha o repositório.
3. Confira as opções de build:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** `/`
4. Em **Settings → Build → Variables and secrets**, cadastre as variáveis usadas na compilação:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Use os mesmos valores do `.env.local`. A chave anônima é pública por natureza; a proteção dos dados é feita pelas políticas RLS do banco. Nunca cadastre a `service_role`.
5. Salve e rode o primeiro deploy. O endereço fica no formato `https://qualinutri.<sua-conta>.workers.dev`.

Depois disso, cada envio para a branch principal gera um novo deploy. Um domínio próprio pode ser ligado em **Settings → Domains & Routes**, sem mudanças no código.

### Comandos locais

```bash
npm run preview:cloudflare   # compila e serve localmente com o mesmo motor da Cloudflare
npm run deploy               # compila e publica direto pelo terminal (exige npx wrangler login)
```

A versão do Node usada no build está em `.node-version`.

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
