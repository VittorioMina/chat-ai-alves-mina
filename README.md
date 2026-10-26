# Mandacaru: chat de IA com a API da Groq

O Mandacaru é um monitor de Algoritmos e Estrutura de Dados que funciona no navegador e responde às perguntas dos estudantes usando o modelo Llama 3.3 70B pela API da Groq. O nome vem do cacto da caatinga que floresce durante o período seco, representando o estudante que consegue entender aquele exercício difícil, principalmente na véspera da prova.

Atividade da Aula 4, TEC13 Engenharia de IA Aplicada, IFBA Campus Irecê.

**Aluno:** Vittorio Kevin Alves Mina

## Tecnologias utilizadas

- Node.js 18 ou superior
- Express 5
- groq-sdk
- dotenv
- HTML, CSS e JavaScript puro
- marked e DOMPurify via CDN

## Como executar o projeto

1. Clone o repositório e instale as dependências:
   ```
   npm install
   ```
2. Copie o arquivo `.env.example` para `.env` e preencha a chave da API da Groq, gerada em console.groq.com:
   ```
   GROQ_API_KEY=sua_chave_aqui
   ```
3. Inicie o servidor:
   ```
   npm start
   ```
4. Acesse http://localhost:3000 no navegador.

Se a chave não estiver configurada no arquivo `.env`, o servidor informa o problema no terminal e não inicia.

## Estrutura do projeto

```
chat-ia-mandacaru/
├── public/
│   ├── css/index.css
│   ├── js/main.js
│   └── index.html
├── .env              (não vai para o GitHub)
├── .env.example
├── .gitignore
├── index.js
├── package.json
└── README.md
```

## Rotas do servidor

| Rota | Método | Função |
| --- | --- | --- |
| `/api/chat` | POST | Recebe a mensagem e devolve a resposta completa, com informações de uso e custo. |
| `/api/chat-stream` | POST | Envia a resposta aos poucos, conforme o modelo gera o texto. |
| `/api/reset` | POST | Apaga o histórico da conversa atual. |
| `/api/models` | GET | Lista os modelos disponíveis no seletor. |

O servidor também valida as mensagens recebidas. Mensagens vazias retornam erro 400, mensagens acima de 4.000 caracteres retornam erro 413 e modelos que não estão na lista permitida retornam erro 400.

## Desafios implementados

### Desafio 1 — Memória de conversa

O histórico fica no servidor e é enviado novamente para a API da Groq a cada pergunta. Isso permite que o modelo considere as mensagens anteriores, mesmo que a API não mantenha a conversa sozinha.

O histórico é limitado a 10 trocas, por meio de `MAX_TROCAS` e `montarMensagens()`, em `index.js`.

Teste: ao informar "meu nome é Ana" e depois perguntar "qual é o meu nome?", o assistente consegue responder Ana porque essa informação continua no histórico da conversa.

### Desafio 2 — Indicador de carregamento

Quando uma pergunta é enviada, aparece a mensagem "Pensando..." e o botão de envio fica desabilitado enquanto a resposta está sendo processada.

No modo de streaming, o indicador desaparece quando chega o primeiro trecho de texto. Isso deixa mais claro que o sistema está respondendo, em vez de parecer que travou.

As funções responsáveis são `mostrarPensando()` e `setOcupado()`, em `main.js`.

### Desafio 3 — Assistente especializado

O prompt inicial foi substituído por um texto que define o Mandacaru como monitor de Algoritmos e Estrutura de Dados do curso de Análise e Desenvolvimento de Sistemas do IFBA Campus Irecê.

O assistente deve responder em português, considerar que o estudante está no primeiro ano, explicar a ideia antes de apresentar um código curto em C, dar dicas antes da solução de exercícios, reconhecer quando não sabe uma resposta e respeitar o limite de 250 palavras.

A configuração fica na constante `SYSTEM_PROMPT`, em `index.js`.

**Prompt antigo:**
> Não responda nada fora do contexto de ciência da computação e programação.

**Exemplos de mudança de comportamento**

1. Pergunta: "Faça um programa em C que inverte um vetor."
   - Antes: o assistente pode apresentar diretamente o código, sem organizar a explicação ou orientar o estudante sobre a lógica.
   - Depois: o Mandacaru procura explicar a ideia de trocar o primeiro elemento com o último, o segundo com o penúltimo e assim por diante. Em seguida, apresenta um exemplo curto em C.

2. Pergunta: "Qual a capital da Bahia?"
   - Antes: a resposta tende a ser limitada pela regra de não responder assuntos fora de ciência da computação e programação.
   - Depois: como o Mandacaru é especializado em programação, a pergunta continua fora do seu foco. A resposta esperada é informar que a pergunta não está relacionada ao conteúdo de Algoritmos e Estrutura de Dados.

3. Pergunta: "O que é uma árvore binária?"
   - Antes: a resposta pode ser mais genérica, dependendo do modelo e do restante das instruções.
   - Depois: a explicação deve ser voltada para um estudante iniciante, mostrando que cada nó pode ter até dois filhos e, se necessário, apresentando um exemplo simples em C.

### Desafio 4 — Comparação entre modelos

O seletor permite escolher entre `llama-3.3-70b-versatile` e `llama-3.1-8b-instant`. O servidor aceita apenas os modelos cadastrados na lista `MODELOS`.

Para comparar os dois, deve-se enviar exatamente a mesma pergunta, com o mesmo histórico e as mesmas configurações, e observar o tempo, os tokens de saída e a qualidade das respostas.

| Modelo | Pergunta utilizada | Tempo | Tokens de saída | Qualidade observada |
| --- | --- | --- | --- | --- |
| Llama 3.3 70B | Explique como funciona a busca binária e dê um exemplo em C. | Conferir no painel | Conferir no painel | A expectativa é uma explicação mais detalhada e organizada, com maior cuidado na lógica. |
| Llama 3.1 8B | A mesma pergunta | Conferir no painel | Conferir no painel | A expectativa é uma resposta mais rápida e direta, podendo apresentar menos detalhes. |

A comparação deve considerar também se os códigos apresentados estão corretos e se a explicação é fácil de entender. O modelo maior não é necessariamente melhor em todas as respostas, e o resultado pode variar conforme a pergunta.

### Desafio 5 — Painel de tokens e custo

O servidor utiliza os dados de uso devolvidos pela Groq para calcular o custo estimado de cada resposta. O painel mostra o modelo utilizado, o tempo de resposta, os tokens consumidos, o total acumulado da sessão e uma projeção para 1.000 conversas iguais.

Os preços de referência informados na atividade são:

| Modelo | Entrada por 1 milhão de tokens | Saída por 1 milhão de tokens |
| --- | --- | --- |
| `llama-3.3-70b-versatile` | US$ 0,59 | US$ 0,79 |
| `llama-3.1-8b-instant` | US$ 0,05 | US$ 0,08 |

Esses valores são referências da atividade e precisam ser conferidos na tabela oficial da Groq antes da entrega do relatório.

O custo é calculado considerando os tokens de entrada e de saída. Como o histórico é reenviado a cada pergunta, o consumo de entrada pode aumentar durante a conversa.

A projeção para 1.000 conversas é uma estimativa baseada no uso observado. Ela não representa necessariamente o custo real de 1.000 usuários diferentes, pois cada pessoa pode enviar quantidades diferentes de mensagens e receber respostas de tamanhos variados.

### Desafio 6 — Tratamento de erros

A função `traduzirErro()`, em `index.js`, transforma os erros da API em mensagens mais compreensíveis.

O sistema diferencia problemas como:

- **400:** solicitação inválida.
- **401:** chave de API inválida ou não autorizada.
- **404:** modelo ou recurso não encontrado.
- **413:** mensagem acima do limite permitido.
- **429:** limite de requisições atingido.
- **5xx:** instabilidade ou falha temporária do serviço.
- **Falha de conexão:** problema de comunicação com a API.

Por exemplo, quando a chave da Groq é inválida, a tela deve mostrar uma mensagem orientando a verificar `GROQ_API_KEY` no arquivo `.env` e reiniciar o servidor.

Esse tratamento ajuda a entender o que aconteceu sem precisar interpretar diretamente uma mensagem técnica da API.

### Desafio 7 — Respostas em streaming

A rota `/api/chat-stream` utiliza `stream: true` para enviar a resposta em partes, conforme o modelo gera o texto.

O servidor transmite os dados no formato NDJSON, com uma linha JSON por trecho. No navegador, a função `enviarComStreaming()` utiliza `response.body.getReader()` para ler esses trechos e atualizar a mensagem progressivamente.

O último trecho pode incluir as informações de uso disponibilizadas pela Groq em `x_groq`.

A opção "Texto em tempo real" permite ativar ou desativar esse comportamento.

A principal diferença percebida é que, no streaming, o texto começa a aparecer antes de a resposta terminar. No modo tradicional, o usuário espera até que a resposta completa esteja disponível.

### Desafio 8 — Sessões isoladas

Cada aba do navegador gera um identificador próprio com `crypto.randomUUID()` e guarda esse valor no `sessionStorage`.

O servidor utiliza um `Map` para manter o histórico de cada sessão separadamente. Sessões sem atividade por mais de uma hora são removidas.

Isso evita que uma aba utilize o histórico de outra. Por exemplo, se uma aba informar o nome Ana e outra informar o nome Pedro, cada conversa deve lembrar apenas o nome informado nela.

O botão "Nova conversa" apaga o histórico da sessão atual.

### Desafio 9 — Proteção contra XSS

As respostas do modelo podem conter Markdown, que é convertido em HTML pela biblioteca `marked`. Inserir esse HTML diretamente na página sem sanitização pode permitir a execução de conteúdo malicioso.

Um exemplo é um texto que contenha uma imagem com um atributo `onerror` capaz de executar JavaScript. Se esse conteúdo for inserido sem proteção, poderá representar um risco para o navegador.

Para evitar isso, as respostas passam por `DOMPurify.sanitize(marked.parse(texto))`, por meio da função `markdownSeguro()`, em `main.js`. Assim, atributos e conteúdos perigosos são removidos antes da inserção na página.

As mensagens digitadas pelo usuário são inseridas com `textContent`, em vez de serem interpretadas como HTML.

A proteção reduz o risco de XSS, mas não substitui outras medidas de segurança, como manter as dependências atualizadas e validar os dados recebidos.

## Arquitetura

O navegador não se comunica diretamente com a Groq. O arquivo `main.js` chama as rotas do próprio servidor Express, e o servidor realiza as solicitações à API usando a chave armazenada no arquivo `.env`.

Essa separação é importante porque o JavaScript enviado ao navegador pode ser inspecionado por qualquer visitante. Se a chave estivesse no `main.js`, ela poderia ser copiada e utilizada por outras pessoas, consumindo o limite da conta ou gerando cobranças.

Com o servidor no meio, também é possível validar as mensagens, limitar os modelos disponíveis, separar os históricos por sessão, calcular custos e apresentar erros de maneira mais clara.

## Verificação de segurança do Git

Antes do primeiro envio para o GitHub, foram utilizados os comandos solicitados na atividade para verificar se a chave da API poderia ser enviada acidentalmente.

O `.gitignore` contém uma regra para ignorar o arquivo `.env`, enquanto o `.env.example` pode ser enviado porque contém apenas o campo de configuração, sem a chave real.

A verificação descrita na atividade incluiu:

- `git check-ignore` para confirmar que o `.env` é ignorado.
- `git grep` para procurar possíveis ocorrências da chave nos arquivos rastreados.
- Busca no histórico com `git log -p`.
- Verificação dos arquivos presentes nos commits.

Segundo o resultado registrado durante a verificação, o `.env` foi identificado como ignorado pela regra correspondente do `.gitignore`, e as demais buscas não retornaram ocorrências.

## Relatório

**1. Por que a chamada à Groq tem que acontecer no servidor, e não no `main.js`?**

A chamada precisa acontecer no servidor porque a chave da API é uma informação privada. Tudo o que está no `main.js` é enviado ao navegador e pode ser consultado pelas ferramentas de desenvolvedor.

Se a chave estivesse nesse arquivo, qualquer pessoa poderia copiá-la e fazer solicitações à API usando a nossa conta. Isso poderia consumir o limite disponível e impedir que o chat funcionasse para os outros usuários. Em uma conta com cobrança, também poderia gerar gastos indevidos.

Mantendo a chamada no servidor, a chave fica no `.env`, e o navegador só precisa conversar com as rotas do nosso próprio sistema. Isso também facilita validar as mensagens e controlar os modelos que podem ser utilizados.

**2. Qual foi o erro que mais tempo levou para resolver?**

Um dos pontos que exigiu mais atenção foi fazer o streaming funcionar corretamente. No modo tradicional, o navegador recebe a resposta completa de uma vez, enquanto no streaming precisa ler os dados aos poucos.

Foi necessário tratar os trechos recebidos pelo navegador e identificar quando a resposta terminava, para que o texto aparecesse progressivamente sem prejudicar o funcionamento do chat.

Esse processo também exige cuidado com as informações de uso enviadas no final da resposta, pois o painel precisa continuar mostrando os tokens e o custo.

**3. O que acontece quando vocês mudam o system prompt?**

O system prompt influencia o comportamento do assistente, definindo o papel que ele deve assumir, o tipo de pergunta que deve responder e a maneira como deve explicar o conteúdo.

Com o prompt do Mandacaru, a proposta é priorizar Algoritmos e Estrutura de Dados, utilizar uma linguagem adequada para iniciantes e apresentar exemplos em C. Com um prompt mais geral, como "Você é um assistente útil", o modelo tende a responder a uma variedade maior de assuntos, sem seguir necessariamente o mesmo formato de explicação.

Por exemplo, ao perguntar "Qual a capital da Bahia?", o Mandacaru deve tentar manter o foco na programação, enquanto o assistente geral pode responder diretamente que é Salvador.

Isso mostra que o comportamento não depende apenas do modelo escolhido. As instruções enviadas junto com a pergunta também influenciam a resposta.

**4. O modelo inventou alguma informação durante os testes?**

Um risco observado ao utilizar modelos de linguagem é que eles podem apresentar informações incorretas com bastante confiança. Isso é conhecido como alucinação.

Um cenário em que esse problema poderia acontecer seria perguntar o horário de atendimento da coordenação do curso de ADS no IFBA Campus Irecê. Se essa informação não estiver disponível no contexto do modelo, ele pode fornecer um horário plausível, mas que não corresponde ao horário real.

Por isso, mesmo quando uma resposta parece bem escrita, é importante conferir informações específicas sobre o campus, datas, regras acadêmicas e outros dados que precisam estar corretos.

O Mandacaru ajuda na compreensão dos conteúdos, mas não deve ser tratado como uma fonte infalível.

**5. Vocês colocariam este chat no site do IFBA Campus Irecê hoje?**

Ainda não. O projeto já apresenta funcionalidades importantes, como memória de conversa, seleção de modelos, streaming, tratamento de erros e proteção contra XSS. Mesmo assim, antes de disponibilizá-lo para todos os estudantes, seria necessário melhorar alguns pontos.

O custo estimado por conversa pode ser baixo, mas precisaria ser calculado com os números reais do painel. Além disso, os limites da API podem impedir novas respostas quando houver muitas solicitações em pouco tempo.

Também seria importante adicionar limites de requisições para reduzir abusos, avaliar a necessidade de login, armazenar o histórico de maneira mais adequada caso fosse necessário mantê-lo e registrar o uso sem guardar dados pessoais desnecessários.

Outro ponto é a qualidade das respostas. O modelo pode errar e não apresenta necessariamente fontes que permitam confirmar as informações. Para responder com mais segurança a perguntas específicas sobre o IFBA, seria interessante utilizar documentos oficiais do campus como fonte de consulta, por meio de uma solução de recuperação de informações, como RAG.

Portanto, o Mandacaru já serve como protótipo acadêmico para estudar o uso de modelos de linguagem em um chat, mas ainda precisaria de testes, melhorias de segurança e fontes confiáveis antes de ser disponibilizado publicamente.

## Conclusão

O desenvolvimento do Mandacaru permitiu trabalhar com uma API de inteligência artificial em uma aplicação web, além de implementar recursos importantes para o funcionamento de um chat.

A memória permite manter o contexto da conversa, o streaming torna a resposta mais dinâmica e o seletor facilita a comparação entre modelos. O painel de tokens ajuda a entender o consumo da API, enquanto o tratamento de erros e a proteção contra XSS melhoram a segurança e a experiência de uso.

O projeto também demonstra que integrar uma IA vai além de enviar uma pergunta e mostrar a resposta. É necessário proteger as credenciais, controlar as solicitações, lidar com falhas e considerar que o modelo pode fornecer informações incorretas.

Mesmo sendo um projeto acadêmico, o Mandacaru reúne recursos que podem servir como base para aplicações mais completas de inteligência artificial voltadas ao apoio dos estudantes.
