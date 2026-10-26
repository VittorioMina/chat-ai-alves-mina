// ============================================================
//  Mandacaru: servidor Node + Express que conversa com a Groq
//  A chave de API só existe aqui, lida do .env. O navegador
//  nunca a vê: ele fala apenas com as rotas /api/* abaixo.
// ============================================================
import "dotenv/config"; // carrega o .env para process.env (tem de vir antes de ler process.env)
import express from "express";
import Groq from "groq-sdk";

const app = express();
app.use(express.json()); // sem isto, req.body chega undefined
app.use(express.static("public")); // serve index.html, CSS e JS da pasta public

const PORT = process.env.PORT || 3000;

// Falha cedo e com mensagem clara se a chave não foi configurada
if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY não definida. Copie .env.example para .env e preencha sua chave.");
  process.exit(1);
}

// Cliente criado uma vez só, no escopo do módulo, e reaproveitado em toda requisição
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ------------------------------------------------------------
// DESAFIO 4 + 5: modelos permitidos e preço aproximado
// (US$ por 1 milhão de tokens, tabela pública da Groq)
// ------------------------------------------------------------
const MODELOS = {
  "llama-3.3-70b-versatile": { nome: "Llama 3.3 70B", entrada: 0.59, saida: 0.79 },
  "llama-3.1-8b-instant": { nome: "Llama 3.1 8B", entrada: 0.05, saida: 0.08 },
};
const MODELO_PADRAO = "llama-3.3-70b-versatile";

// ------------------------------------------------------------
// DESAFIO 3: system prompt de assistente especializado
// ------------------------------------------------------------
const SYSTEM_PROMPT = {
  role: "system",
  content: `Você é o Mandacaru, monitor de Algoritmos e Estrutura de Dados do curso de Análise e Desenvolvimento de Sistemas do IFBA Campus Irecê.
Regras:
1. Responda sempre em português do Brasil, com linguagem clara para estudantes do primeiro ano.
2. Só trate de computação e programação. Se a pergunta for de outro assunto, recuse em uma frase e sugira um tema de programação relacionado.
3. Explique primeiro a ideia e depois mostre um exemplo curto de código (em C, ou na linguagem que o estudante usar) em bloco de código Markdown.
4. Se parecer exercício de lista ou de prova, não entregue a solução completa de primeira: dê uma dica e pergunte se o estudante quer ver a resposta.
5. Se não tiver certeza de algo, diga que não tem certeza em vez de inventar.
6. Use no máximo 250 palavras, a menos que o estudante peça mais detalhes.`,
};

// ------------------------------------------------------------
// DESAFIO 1 + 8: memória de conversa isolada por sessão
// Cada aba do navegador gera um sessionId; o Map guarda o
// histórico de cada uma. A API da Groq é stateless, então
// reenviamos o histórico inteiro em toda chamada.
// ------------------------------------------------------------
const MAX_TROCAS = 10; // 10 perguntas + 10 respostas
const MAX_CARACTERES = 4000; // tamanho máximo de uma mensagem
const sessoes = new Map(); // sessionId -> { historico, ultimoUso }

function obterHistorico(sessionId) {
  if (!sessoes.has(sessionId)) {
    sessoes.set(sessionId, { historico: [], ultimoUso: Date.now() });
  }
  const sessao = sessoes.get(sessionId);
  sessao.ultimoUso = Date.now();
  return sessao.historico;
}

// Monta o que vai para a Groq: system prompt + as últimas 10 trocas
function montarMensagens(historico) {
  return [SYSTEM_PROMPT, ...historico.slice(-MAX_TROCAS * 2)];
}

// Limpeza: sessões paradas há mais de 1 hora saem da memória
setInterval(() => {
  const limite = Date.now() - 60 * 60 * 1000;
  for (const [id, sessao] of sessoes) {
    if (sessao.ultimoUso < limite) sessoes.delete(id);
  }
}, 10 * 60 * 1000).unref();

// ------------------------------------------------------------
// Validação comum às duas rotas de chat
// Devolve os dados prontos, ou null se já respondeu com 400/413
// ------------------------------------------------------------
function validarEntrada(req, res) {
  const { message, sessionId, model } = req.body ?? {};

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Mensagem não fornecida!" });
    return null;
  }
  if (message.length > MAX_CARACTERES) {
    res.status(413).json({ error: `Mensagem longa demais. O limite é ${MAX_CARACTERES} caracteres.` });
    return null;
  }
  if (typeof sessionId !== "string" || !/^[\w-]{8,100}$/.test(sessionId)) {
    res.status(400).json({ error: "sessionId ausente ou inválido. Recarregue a página." });
    return null;
  }
  const modelo = model ?? MODELO_PADRAO;
  if (!MODELOS[modelo]) {
    res.status(400).json({ error: `Modelo não permitido: ${modelo}` });
    return null;
  }
  return { message: message.trim(), sessionId, modelo };
}

// ------------------------------------------------------------
// DESAFIO 5: custo de uma chamada a partir do campo usage
// ------------------------------------------------------------
function calcularCusto(modelo, usage) {
  const preco = MODELOS[modelo];
  return (usage.prompt_tokens * preco.entrada + usage.completion_tokens * preco.saida) / 1_000_000;
}

// Log no terminal: só metadados e o começo da resposta, nunca a chave
function registrar(modelo, usage, latenciaMs, resposta) {
  const custo = usage ? calcularCusto(modelo, usage) : 0;
  const tokens = usage ? `${usage.prompt_tokens}→${usage.completion_tokens} tokens` : "tokens: ?";
  const previa = resposta.replace(/\s+/g, " ").slice(0, 80);
  console.log(`[${MODELOS[modelo].nome}] ${latenciaMs} ms | ${tokens} | US$ ${custo.toFixed(6)} | "${previa}..."`);
}

// ------------------------------------------------------------
// DESAFIO 6: mensagem específica para cada erro da Groq
// ------------------------------------------------------------
function traduzirErro(error) {
  const status = error?.status;
  const mensagens = {
    400: "Requisição inválida para a Groq. Confira o nome do modelo.",
    401: "Chave de API inválida. Verifique o GROQ_API_KEY no arquivo .env e reinicie o servidor.",
    404: "Modelo não encontrado na Groq. Ele pode ter sido descontinuado.",
    413: "A conversa ficou longa demais para o modelo. Clique em Nova conversa.",
    429: "Muitas perguntas em pouco tempo. Aguarde uns 30 segundos ou troque para o modelo 8B.",
  };
  if (mensagens[status]) return { status, mensagem: mensagens[status] };
  if (status >= 500) return { status: 502, mensagem: "A Groq está instável agora. Tente de novo em instantes." };
  if (!status) return { status: 502, mensagem: "Sem conexão com a Groq. Verifique a internet do servidor." };
  return { status: 500, mensagem: "Erro ao consultar a API da Groq." };
}

// ============================================================
// ROTA 1: POST /api/chat (resposta inteira de uma vez, JSON)
// ============================================================
app.post("/api/chat", async (req, res) => {
  const entrada = validarEntrada(req, res);
  if (!entrada) return;
  const { message, sessionId, modelo } = entrada;

  const historico = obterHistorico(sessionId);
  historico.push({ role: "user", content: message });

  try {
    const inicio = Date.now();
    const responseGroq = await groq.chat.completions.create({
      model: modelo,
      messages: montarMensagens(historico), // envia o histórico todo de novo
      temperature: 0.5,
      max_tokens: 1024,
    });
    const latenciaMs = Date.now() - inicio;

    // ?. evita derrubar o servidor se choices vier vazio
    const resposta = responseGroq.choices[0]?.message?.content || "";
    historico.push({ role: "assistant", content: resposta });

    const usage = responseGroq.usage;
    registrar(modelo, usage, latenciaMs, resposta);

    res.json({
      response: resposta,
      model: modelo,
      latencyMs: latenciaMs,
      usage: usage ?? null,
      costUsd: usage ? calcularCusto(modelo, usage) : 0,
    });
  } catch (error) {
    historico.pop(); // tira a pergunta que ficou sem resposta
    const { status, mensagem } = traduzirErro(error);
    console.error(`Erro ao chamar a API da Groq [${error?.status ?? "sem status"}]:`, error.message);
    return res.status(status).json({ error: mensagem });
  }
});

// ============================================================
// ROTA 2: POST /api/chat-stream (DESAFIO 7: streaming)
// Envia uma linha JSON por pedaço de texto (formato NDJSON):
//   {"type":"delta","content":"..."}   enquanto o modelo gera
//   {"type":"done", usage, costUsd...}  ao final
//   {"type":"error","error":"..."}      se algo falhar no meio
// ============================================================
app.post("/api/chat-stream", async (req, res) => {
  const entrada = validarEntrada(req, res);
  if (!entrada) return;
  const { message, sessionId, modelo } = entrada;

  const historico = obterHistorico(sessionId);
  historico.push({ role: "user", content: message });

  // Se a aba fechar no meio, cancelamos a geração na Groq
  const cancelador = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) cancelador.abort();
  });

  let resposta = "";
  try {
    const inicio = Date.now();
    // Erros como 401 e 429 acontecem aqui, antes de enviarmos qualquer byte,
    // por isso ainda dá para responder com o código HTTP certo no catch.
    const stream = await groq.chat.completions.create(
      {
        model: modelo,
        messages: montarMensagens(historico),
        temperature: 0.5,
        max_tokens: 1024,
        stream: true, // a diferença está aqui
      },
      { signal: cancelador.signal },
    );

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    let usage = null;
    for await (const chunk of stream) {
      const pedaco = chunk.choices[0]?.delta?.content || "";
      if (pedaco) {
        resposta += pedaco;
        res.write(JSON.stringify({ type: "delta", content: pedaco }) + "\n");
      }
      // a Groq manda o usage no último pedaço, dentro de x_groq
      usage = chunk.x_groq?.usage ?? chunk.usage ?? usage;
    }
    const latenciaMs = Date.now() - inicio;

    historico.push({ role: "assistant", content: resposta });
    registrar(modelo, usage, latenciaMs, resposta);

    res.end(
      JSON.stringify({
        type: "done",
        model: modelo,
        latencyMs: latenciaMs,
        usage,
        costUsd: usage ? calcularCusto(modelo, usage) : 0,
      }) + "\n",
    );
  } catch (error) {
    if (cancelador.signal.aborted) {
      historico.pop();
      return console.log("Streaming cancelado: o navegador fechou a conexão.");
    }
    const { status, mensagem } = traduzirErro(error);
    console.error(`Erro no streaming da Groq [${error?.status ?? "sem status"}]:`, error.message);

    if (!res.headersSent) {
      historico.pop();
      return res.status(status).json({ error: mensagem });
    }
    // O streaming já tinha começado: o código HTTP já foi enviado,
    // então avisamos o erro dentro do próprio fluxo
    if (resposta) historico.push({ role: "assistant", content: resposta });
    else historico.pop();
    res.end(JSON.stringify({ type: "error", error: mensagem }) + "\n");
  }
});

// ============================================================
// ROTA 3: POST /api/reset (botão "Nova conversa")
// ============================================================
app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body ?? {};
  if (typeof sessionId === "string") sessoes.delete(sessionId);
  res.json({ ok: true });
});

// ============================================================
// ROTA 4: GET /api/models (alimenta o <select> do navegador)
// ============================================================
app.get("/api/models", (req, res) => {
  const lista = Object.entries(MODELOS).map(([id, m]) => ({ id, ...m }));
  res.json({ padrao: MODELO_PADRAO, modelos: lista });
});

app.listen(PORT, () => {
  console.log(`Mandacaru rodando em http://localhost:${PORT}`);
});
