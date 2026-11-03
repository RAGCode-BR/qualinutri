# Importação do relatório de clientes de 03/11/2026

O PDF original foi processado fora do repositório. Nenhum cadastro pessoal foi versionado no Git.

- Registros identificados pelo código do relatório: **1.463**; todos foram importados com `legacy_code` distinto.
- Cadastros anteriores preservados: **2**; total no banco após a importação: **1.465**.
- Documentos validados pelo mesmo algoritmo do cadastro: **1.412** (1.306 CPF e 106 CNPJ).
- Documentos ausentes, incompletos ou inválidos: **51**. O valor original permanece em `legacy_details.document_raw`; `document` fica vazio até correção.
- Há **26 ocorrências adicionais de documentos válidos repetidos**. Cada código do relatório permanece como cadastro separado.
- Endereços importados: **1.463**. Telefone principal: **1.174**; segundo telefone: **396**; contato: **294**; e-mail principal reconhecido: **362**. Os valores originais, inclusive e-mails adicionais, ficam em `legacy_details`.

O endereço usa `customers.address` com rua, complemento, bairro, cidade, UF e CEP. `legacy_details` guarda inscrição estadual/RG, órgão expedidor, telefones adicionais, fax, data de nascimento, nome do contato, e-mails do PDF e documento original. A ficha do cliente mostra esses campos e o código original. A lista é buscada em páginas de 500 para ultrapassar o limite padrão da API.

Os 51 documentos pendentes exigem conferência humana para se tornarem CPF/CNPJ validado. O código original permite localizar a linha correspondente no PDF.
