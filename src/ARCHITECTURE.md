# Estrutura inicial

Esta estrutura registra a arquitetura resultante da migração incremental do sistema legado.

- `app`: composição e inicialização da aplicação.
- `assets`: imagens e outros arquivos estáticos extraídos do legado.
- `components`: componentes compartilhados e sem regra de negócio específica.
- `domain`: cálculos e regras puras, independentes de React e Supabase.
- `features`: módulos funcionais, como calculadora, produtos, preços e frete.
- `hooks`: hooks reutilizáveis.
- `layouts`: estruturas visuais de página.
- `lib`: configuração de bibliotecas externas.
- `pages`: composição das áreas navegáveis.
- `services`: acesso a fontes externas de dados.
- `types`: tipos compartilhados.
- `utils`: utilitários sem estado.

Os dados comerciais de referência permanecem no snapshot versionado `src/data/commercial-snapshot.json`. Testes e geração do seed não dependem mais do arquivo HTML original.

## Fonte dos dados comerciais

O `CommercialDataProvider` é o único ponto de estado responsável pelo catálogo usado pela interface. Ele inicia com o snapshot local do HTML para que a calculadora permaneça disponível e solicita o catálogo remoto uma única vez por meio de `commercialDataService`.

O acesso ao Supabase está separado por responsabilidade:

- `productService`: produtos, categorias, condições com preço e tabela vigente;
- `discountService`: regras selecionáveis da tabela de descontos vigente;
- `freightService`: tabelas, faixas, tarifas e taxa de descarga vigentes;
- `policyService`: versão e seções da política vigente.

Os componentes consomem somente `CommercialData`; eles não executam queries. Os cálculos permanecem nas funções puras de `domain` e não consultam o banco durante alterações da calculadora.

Depois da autenticação, apenas perfis ativos carregam os dados remotos. Falhas de leitura são convertidas em uma mensagem segura e o snapshot local continua disponível; erros técnicos do PostgreSQL ou do PostgREST não são exibidos ao usuário.

## Persistência histórica de orçamentos

`createQuoteSnapshot` copia todas as entradas, textos comerciais e resultados calculados. O snapshot não depende do catálogo vigente para ser reconstruído posteriormente e mantém os valores intermediários sem arredondamento adicional.

`quoteService` converte esse snapshot para o contrato do PostgreSQL. A função `create_quote` grava `quotes` e `quote_items` na mesma transação. O serviço também prepara listagem, consulta, duplicação e cancelamento lógico; não existe exclusão física de histórico.

As tabelas e a função transacional usam RLS. Administradores e usuários comerciais podem gravar clientes e orçamentos; consultas não têm acesso a essas áreas. Escrita anônima permanece bloqueada.

## Clientes

`customerService` concentra criação, edição, consulta, listagem e desativação lógica. Clientes não são excluídos fisicamente, e o documento não é normalizado nem tratado como chave sem uma regra comercial aprovada.

O orçamento referencia o cliente, mas também guarda snapshots de nome e documento. Assim, uma correção cadastral futura não muda a identificação apresentada em um orçamento histórico.

## Autenticação e autorização

`AuthProvider` concentra sessão, login, logout e perfil. `AuthGate` impede que a aplicação interna seja montada sem sessão ou com uma conta inativa. A interface autentica por login e senha; internamente, um endereço técnico não entregável e determinístico é usado apenas como identificador exigido pelo Supabase Auth.

O cadastro público está desabilitado no frontend e no Supabase Auth. A criação de contas ocorre somente na área administrativa por meio da Edge Function `create-user`, que valida a sessão e o papel do solicitante antes de usar a API administrativa. A `service_role` permanece exclusivamente no ambiente seguro da função.

Contas administrativas são criadas com `must_change_password = true`. Após autenticar com a senha temporária, `AuthGate` permite apenas a tela de troca. A Edge Function `change-initial-password` altera a senha no Supabase Auth e só então libera o perfil; componentes do navegador nunca recebem a chave administrativa.

Administradores podem redefinir a credencial de outro usuário pela Edge Function `reset-user-password`. A função grava uma nova senha temporária e restaura `must_change_password = true`. `current_profile_role` só retorna um papel quando esse marcador está falso, bloqueando também as operações RLS durante a troca pendente.

Os papéis disponíveis são:

- `administrador`: gerencia usuários e dados comerciais;
- `comercial`: gerencia clientes e orçamentos;
- `consulta`: consulta catálogo, tabelas e política.

As permissões visuais refletem as políticas RLS, mas a autorização efetiva fica no PostgreSQL. O banco também impede a desativação, o rebaixamento ou a exclusão do último administrador ativo.

## Edição de produtos

Administradores editam nome, peso e preços de um produto pela página **Produtos**. `productService` chama a função `update_product`, que valida os dados e grava produto e preços da tabela vigente na mesma transação. A exclusão chama `deactivate_product` e é lógica: o produto sai do catálogo e da calculadora, mas permanece referenciado pelos orçamentos.

Toda alteração em `products` e `product_prices` é registrada por gatilho em `product_change_log`, com os valores anteriores, os novos, o autor e o horário. A edição só é liberada quando o catálogo vem do Supabase; com o snapshot local, a página fica somente leitura.

## Edição de descontos

Administradores criam, editam e excluem linhas de desconto pela página **Descontos**. `discountService` chama `save_discount_rule` (cria quando não recebe id) e `deactivate_discount_rule`. A exclusão é lógica. Linhas novas entram antes de "Outro / personalizado", e a Calculadora reconhece a linha personalizada por não ter percentual fixo, não pela posição. O 1,5% do pagamento antecipado é fixo no domínio de cálculo e não é editado por essa página. Alterações ficam registradas em `discount_change_log`.

## Edição de frete

Administradores criam, editam e excluem faixas da tabela Juara e cidades da tabela Regional pela página **Frete**, e alteram o valor padrão da chapa. `freightService` chama `save_freight_zone` (cria quando não recebe id e grava as tarifas da faixa), `deactivate_freight_zone` (exclusão lógica) e `save_handling_rate`. Na Regional, deixar a fracionada vazia remove essa tarifa: a cidade passa a aceitar só carga fechada. Alterações em faixas, tarifas e chapa ficam em `freight_change_log`. A Calculadora reencontra a faixa escolhida pelo nome quando a tabela muda e desmarca o frete se ela foi excluída.
