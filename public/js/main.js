// ============================================================
//  Mandacaru: lógica do chat no navegador
//  Este arquivo NUNCA fala com a Groq e não conhece a chave.
//  Ele só chama as rotas do nosso próprio servidor (/api/...).
// ============================================================

// ── 1. referências aos elementos da página ──
const inputMessage = document.getElementById("inputMessage");
const btnSend = document.getElementById("btnSend");
const chatArea = document.getElementById("chatArea");
const selectModel = document.getElementById("selectModel");
const toggleStream = document.getElementById("toggleStream");
const btnReset = document.getElementById("btnReset");
const usoTokens = document.getElementById("usoTokens");
const usoCusto = document.getElementById("usoCusto");
const usoProjecao = document.getElementById("usoProjecao");

inputMessage.focus(); // cursor já no campo ao abrir a página

// ── 2. sessão desta aba (Desafio 8) ──
// sessionStorage vale só para esta aba: duas abas = duas conversas
function gerarId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
let sessionId = sessionStorage.getItem("sessionId") || gerarId();
sessionStorage.setItem("sessionId", sessionId);

// ── 3. contadores do painel de custo (Desafio 5) ──
let tokensSessao = 0;
let custoSessao = 0;
const formatoNumero = new Intl.NumberFormat("pt-BR");

function atualizarPainel(usage, custo) {
  if (usage) tokensSessao += usage.total_tokens ?? usage.prompt_tokens + usage.completion_tokens;
  custoSessao += custo || 0;
  usoTokens.textContent = formatoNumero.format(tokensSessao);
  usoCusto.textContent = "US$ " + custoSessao.toFixed(6).replace(".", ",");
  // projeção: se 1.000 conversas custassem o mesmo que esta sessão
  usoProjecao.textContent = "US$ " + (custoSessao * 1000).toFixed(2).replace(".", ",");
}

// ── 4. Markdown seguro (Desafio 9) ──
// marked.parse converte Markdown em HTML; DOMPurify remove <script>,
// onerror= e qualquer outro código que o texto possa carregar
DOMPurify.addHook("afterSanitizeAttributes", (no) => {
  if (no.tagName === "A") {
    no.setAttribute("target", "_blank");
    no.setAttribute("rel", "noopener noreferrer");
  }
});

function markdownSeguro(texto) {
  return DOMPurify.sanitize(marked.parse(texto));
}

// ── 5. cria e insere uma bolha de mensagem ──
function addMessage(message, sender) {
  const divMessage = document.createElement("div");
  divMessage.classList.add("message", sender); // "user" ou "bot" define o estilo

  if (sender === "user") {
    divMessage.textContent = message; // texto do usuário entra como texto puro
  } else {
    divMessage.innerHTML = markdownSeguro(message);
  }
  chatArea.appendChild(divMessage);
  rolarParaOFim();
  return divMessage;
}

function addErro(mensagem) {
  const div = addMessage("", "bot");
  div.classList.add("erro");
  div.textContent = mensagem;
}

// linha pequena abaixo da resposta: modelo, tempo e tokens
function addMeta(bolha, dados) {
  const nomes = { "llama-3.3-70b-versatile": "70B", "llama-3.1-8b-instant": "8B" };
  const partes = [nomes[dados.model] || dados.model, (dados.latencyMs / 1000).toFixed(1).replace(".", ",") + " s"];
  if (dados.usage) {
    partes.push(`${dados.usage.prompt_tokens} tokens de entrada, ${dados.usage.completion_tokens} de saída`);
  }
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = partes.join(" | ");
  bolha.appendChild(meta);
  rolarParaOFim();
}

function rolarParaOFim() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ── 6. indicador de carregamento (Desafio 2) ──
function mostrarPensando() {
  const loading = document.createElement("div");
  loading.classList.add("message", "bot", "pensando");
  loading.textContent = "Pensando";
  chatArea.appendChild(loading);
  rolarParaOFim();
  return loading;
}

let ocupado = false;
function setOcupado(valor) {
  ocupado = valor;
  btnSend.disabled = valor; // impede envio duplicado
}

// ── 7. envia a mensagem ao backend ──
async function sendMessage() {
  const message = inputMessage.value.trim();
  if (!message || ocupado) return; // ignora envio vazio ou repetido

  inputMessage.value = ""; // limpa o campo imediatamente
  ajustarAltura();
  inputMessage.focus();

  addMessage(message, "user");
  const loading = mostrarPensando();
  setOcupado(true);

  // o corpo vai como texto JSON; o express.json() do servidor faz o caminho inverso
  const corpo = JSON.stringify({ message, sessionId, model: selectModel.value });

  try {
    if (toggleStream.checked) {
      await enviarComStreaming(corpo, loading);
    } else {
      await enviarSemStreaming(corpo, loading);
    }
  } catch (error) {
    loading.remove();
    addErro("Falha de conexão com o servidor. Ele está rodando?");
  } finally {
    setOcupado(false); // libera o botão sempre, com sucesso ou erro
  }
}

// 7a. rota /api/chat: espera a resposta inteira
async function enviarSemStreaming(corpo, loading) {
  // caminho relativo: funciona em localhost e depois de publicado
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
  });
  const data = await response.json();
  loading.remove(); // remove a bolha de espera

  if (!response.ok) return addErro(data.error);

  const bolha = addMessage(data.response, "bot");
  addMeta(bolha, data);
  atualizarPainel(data.usage, data.costUsd);
}

// 7b. rota /api/chat-stream: o texto chega aos pedaços (Desafio 7)
async function enviarComStreaming(corpo, loading) {
  const response = await fetch("/api/chat-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
  });

  // erros como 400, 401 e 429 chegam antes do streaming, como JSON comum
  if (!response.ok) {
    const data = await response.json();
    loading.remove();
    return addErro(data.error);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendente = ""; // pedaço de linha que ainda não terminou
  let texto = "";
  let bolha = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pendente += decoder.decode(value, { stream: true });

    // cada linha completa é um objeto JSON
    const linhas = pendente.split("\n");
    pendente = linhas.pop();

    for (const linha of linhas) {
      if (!linha.trim()) continue;
      const evento = JSON.parse(linha);

      if (evento.type === "delta") {
        if (!bolha) {
          loading.remove(); // primeiro pedaço chegou: some o "Pensando"
          bolha = addMessage("", "bot");
        }
        texto += evento.content;
        bolha.innerHTML = markdownSeguro(texto); // redesenha a cada pedaço
        rolarParaOFim();
      } else if (evento.type === "done") {
        if (!bolha) {
          loading.remove();
          bolha = addMessage(texto || "_(resposta vazia)_", "bot");
        }
        addMeta(bolha, evento);
        atualizarPainel(evento.usage, evento.costUsd);
      } else if (evento.type === "error") {
        loading.remove();
        addErro(evento.error);
      }
    }
  }
  loading.remove(); // garante que a bolha de espera não fica para trás
}

// ── 8. nova conversa: apaga o histórico desta sessão ──
btnReset.addEventListener("click", async () => {
  if (ocupado) return;
  try {
    await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  } catch {
    // mesmo sem servidor, limpamos a tela e trocamos de sessão
  }
  sessionId = gerarId();
  sessionStorage.setItem("sessionId", sessionId);
  chatArea.innerHTML = "";
  tokensSessao = 0;
  custoSessao = 0;
  atualizarPainel(null, 0);
  inputMessage.focus();
});

// ── 9. preenche o seletor com os modelos do servidor (Desafio 4) ──
async function carregarModelos() {
  try {
    const response = await fetch("/api/models");
    const { padrao, modelos } = await response.json();
    selectModel.innerHTML = "";
    for (const m of modelos) {
      const opcao = document.createElement("option");
      opcao.value = m.id;
      opcao.textContent = m.nome;
      selectModel.appendChild(opcao);
    }
    selectModel.value = padrao;
  } catch {
    // se falhar, ficam as opções escritas no HTML
  }
}
carregarModelos();

// ── 10. campo de texto que cresce com o conteúdo ──
function ajustarAltura() {
  inputMessage.style.height = "auto";
  inputMessage.style.height = inputMessage.scrollHeight + "px";
}
inputMessage.addEventListener("input", ajustarAltura);

// ── 11. gatilhos: clique, Enter e sugestões da tela inicial ──
btnSend.addEventListener("click", sendMessage);

inputMessage.addEventListener("keydown", (event) => {
  // Enter envia; Shift + Enter quebra a linha
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});

document.querySelectorAll(".sugestao").forEach((botao) => {
  botao.addEventListener("click", () => {
    inputMessage.value = botao.textContent;
    sendMessage();
  });
});
