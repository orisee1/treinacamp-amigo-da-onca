# Treinacamp — Amigo da Onça · Indique e Ganhe

Site estático responsivo, pronto para GitHub Pages, com backend Supabase isolado, formulário público com lote de no mínimo 10 pessoas por envio e painel administrativo com exportação `.xlsx` e `.pdf`.

## Estrutura

| Caminho | Descrição |
|---|---|
| `index.html` | Site público, formulário, modais e painel administrativo |
| `styles.css` | Identidade visual, layouts responsivos e componentes |
| `app.js` | Validação, envio, login, filtros, status e exportações |
| `config.js` | Somente a URL pública e a chave publicável do Supabase |
| `assets/campanha-amigo-da-onca.jpeg` | Imagem original da campanha |
| `qr.html` | Cartaz A4 com QR Code que aponta para o formulário |
| `supabase/schema.sql` | Tabelas, constraints, índices e segurança RLS |
| `supabase/functions/indicacoes/index.ts` | Backend Supabase Edge Function |

## 1. Criar projeto Supabase exclusivo

1. Projeto exclusivo já criado em https://supabase.com/dashboard/project/tbswlevtdbqspnkdkeuj **sem modificar os existentes**. Selecione o plano **Free**, região próxima dos visitantes, se disponível (o projeto atual foi criado em **East US / Virginia**); nome sugerido `treinacamp-amigo-da-onca`.
2. Quando o projeto estiver pronto, abra o **SQL Editor**, crie uma query e execute integralmente `supabase/schema.sql`. Nunca aplique este SQL aos bancos antigos.
3. Em **Edge Functions**, crie uma função chamada exatamente `indicacoes` e publique o código de `supabase/functions/indicacoes/index.ts`.
4. Configure a função **sem verificação obrigatória de JWT** (`verify_jwt = false`): o envio é público e as ações administrativas exigem um token privado assinado no próprio backend. A função possui verificação de origem e limitação de tentativas.
5. Após aplicar o schema, cadastre o hash e o salt da senha em `public.admin_config` pelo administrador Supabase. **Nunca coloque a senha no repositório GitHub.** Se necessário, defina `ALLOWED_ORIGINS` como `https://orisee1.github.io` nos segredos da função.
6. O Supabase fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` automaticamente para Edge Functions. Nunca as copie para o repositório. Aguarde os serviços ficarem prontos.

### Autenticação e restrições

- A senha é validada no servidor por comparação de hash SHA-256 com salt aleatório guardado no banco protegido com RLS. Nunca é armazenada no navegador nem no repositório.
- Após autenticação, o backend emite uma sessão assinada com validade de até 8 horas, guardada somente no `sessionStorage` do navegador.
- São permitidas no máximo 5 tentativas de login por janela de 15 minutos, por endereço de origem detectado; a proteção reduz, mas não elimina ataques distribuídos.
- Apenas o backend, usando a chave de serviço privada, pode ler ou alterar as indicações. Tabelas com RLS não permitem acesso direto por visitantes.
- O banco exige consentimento, não permite autoindicação e permite cada WhatsApp indicado somente uma vez na campanha. **Cada envio pode conter uma ou mais pessoas**; os envios cumulativos são validados para premiação quando o mesmo aluno atingir dez indicados. Cada lote é gravado em uma transação atômica.
- Este controle por senha curta é compatível com o pedido, **mas um PIN de quatro números não é adequado como única proteção de dados pessoais no longo prazo**. Recomenda-se migrar para autenticação individual com MFA antes de uso em larga escala.

## 2. Conectar o site

Em **Project Settings → API Keys**, copie a **Publishable key** (formato `sb_publishable_...`). Em **Project Settings → Data API**, obtenha a URL do projeto. O `config.js` já contém os dados públicos do projeto novo (não armazena senhas):

```js
window.TREINACAMP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_SUA_CHAVE_PUBLICA",
  BONUS_POR_MATRICULA: 50,
  NOME_ESCOLA: "Treinacamp"
};
```

`SUPABASE_PUBLISHABLE_KEY` **pode ser pública**. A `service_role` **nunca** pode ser pública.

## 3. Publicar no GitHub Pages

1. Crie um repositório público novo, por exemplo `treinacamp-amigo-da-onca`. Não reaproveite nem altere repositórios anteriores.
2. Adicione os arquivos da pasta do projeto na raiz do novo repositório; não é necessário usar npm nem build.
3. Em **Settings → Pages → Build and deployment**, selecione **Source: GitHub Actions**. Depois de ativado, reexecute o workflow em **Actions** ou faça novo commit.
4. O endereço será `https://orisee1.github.io/treinacamp-amigo-da-onca/` se criado na conta `orisee1` com esse nome.
5. Acesse a página, faça um envio de teste autorizado, entre no painel pelo atalho **Alt + Shift + E**, confira a indicação, altere seu status e teste os downloads.

## 4. Cartaz com QR Code

Após a publicação, abra `https://orisee1.github.io/treinacamp-amigo-da-onca/qr.html` e clique em **Imprimir / Salvar PDF**. A página junta a arte original e um QR Code gerado para a URL pública real da campanha (o link acompanha o local em que `qr.html` é publicado).

## 5. Fluxo administrativo

- Em qualquer parte do site, pressione **Alt + Shift + E**.
- Informe a senha secreta configurada no Supabase.
- Pesquise por aluno, indicado, WhatsApp ou rede social do aluno; filtre os status.
- **Pendente** = indicação recebida; **Matriculado** = matrícula confirmada e prêmio ainda a pagar; **Pago** = prêmio pago; **Cancelado** = indicação sem prêmio.
- Os indicadores mostram número total, matrículas confirmadas, saldo a pagar e pagamentos realizados.
- **Exportar Excel** gera duas abas, `Indicações` e `Resumo`, com os registros filtrados e campos úteis para conferência.
- **Exportar PDF** gera um relatório paginado com os registros filtrados. Os downloads são feitos localmente pelo navegador do administrador.
- O sistema **não envia e-mails com anexos automaticamente**. Para notificações automáticas será necessário configurar um serviço de envio, a caixa de destino e os consentimentos apropriados.

## 6. Privacidade e operação

Este protótipo já contém aviso de privacidade e exigência de autorização do indicado. Antes da coleta real, substitua o aviso genérico por uma política de privacidade com identificação da escola, responsável pelo tratamento, canal de contato, regras de retenção e exclusão de dados, conforme a LGPD. Alinhe também o regulamento da campanha (pagamento, condições de matrícula, elegibilidade e mínimo de 10 amigos por envio) com a direção da escola.

**Atenção ao plano gratuito:** projetos gratuitos podem ser pausados por inatividade. Verifique as condições do Supabase e, antes de usar em uma campanha com volume importante, estabeleça uma rotina de cópia de segurança.

### Teste local

No terminal, dentro da pasta do site: `python -m http.server 5500`. Acesse `http://localhost:5500`. Os dados só serão gravados após configurar e publicar o backend, mesmo durante o teste local.

## Operação vigente (16/10/2026)

- Site: https://orisee1.github.io/treinacamp-amigo-da-onca/
- Os participantes fornecem **nome completo sem abreviações, WhatsApp e rede social opcional**; adicionam amigos individualmente com nome e WhatsApp.
- **Pode enviar a partir de uma indicação.** Envios posteriores são somados se o nome completo normalizado (sem distinção entre maiúsculas/minúsculas e espaços extras) **e o mesmo WhatsApp** coincidirem.
- O aluno pode indicar um amigo agora e outros em dias diferentes. **A campanha só se torna válida para premiação ao completar dez indicações acumuladas**, sem limite máximo.
- Os WhatsApps dos amigos não podem ser repetidos, inclusive em envios anteriores. Tentativas com duplicidade são rejeitadas integralmente.
- Após gravar, o backend responde com o número de indicações deste envio e o total acumulado. O modal confirma o recebimento sem antecipar o pagamento do prêmio.
- Na área ADMIN (`Alt + Shift + E`), os registros são **agrupados por aluno**; o botão **Listar nomes** expande seus amigos, seus contatos e a gestão individual de status.
- O administrador pode **excluir somente uma indicação** ou **excluir o participante e todos os indicados**, ambos com confirmação e verificação de sessão no servidor. Exclusão é definitiva.
- Os relatórios **Excel e PDF** possuem dois modelos: **Simples** (aluno, quantidade total e validação) e **Detalhado** (cada indicação, status e dados relacionados), respeitando os filtros de pesquisa.
- A equipe pode marcar `Matriculado` antes de dez indicações para acompanhar conversões, mas a opção `Pago` só fica disponível após o participante completar dez; o servidor também verifica o requisito.
- O menu **Gerar QR Code** não aparece mais no painel, mas `qr.html` continua existindo para uso futuro.
- Dados de identificadores e registros anteriores são preservados durante as migrações.
- RLS mantém tabelas sem acesso direto de visitantes. Funções de exclusão e consultas especiais usam `service_role`, acessíveis apenas à Edge Function.
- Ao operar, revise o regulamento da campanha, os textos de privacidade e condições de premiação com a direção. O acesso admin por PIN de quatro dígitos deve ser substituído por autenticação individual com MFA antes de operar em escala.

A função atual é `supabase/functions/indicacoes/index.ts` e as funções SQL constam em `supabase/schema.sql`.
