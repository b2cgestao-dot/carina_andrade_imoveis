// Vercel Serverless Function
// Busca o CSV público da planilha do Google Sheets e devolve como HTML estático
// URL final na Vercel: https://seu-projeto.vercel.app/api

// ID da planilha e da aba (gid) da Carteira de Imóveis Carina Andrade
const SHEET_ID = "2PACX-1vSjrM_aGJvJphv7dDnRmAOItq1Jk6PskQBDLtZu39sZIBqlIF3sCwng4Jdygo_Wuw";
const GID = "33975308";

// URL de export em CSV (funciona com qualquer planilha publicada na web)
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${GID}&single=true&output=csv`;

// Parser simples de CSV que respeita aspas e vírgulas dentro de células
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char === "\r") {
        // ignora
      } else {
        cell += char;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(rows) {
  if (rows.length === 0) {
    return "<p>Nenhum imóvel cadastrado no momento.</p>";
  }

  const headers = rows[0];
  const body = rows.slice(1);

  // Formato em lista semântica: cada imóvel vira um bloco com campo: valor
  // Esse formato é muito mais legível para o agente de IA do que uma tabela
  let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Carteira de Imoveis - Carina Andrade Imoveis</title>
</head>
<body>
<h1>Carteira de Imoveis - Carina Andrade Imoveis</h1>
<p>Lista atualizada de imoveis disponiveis para compra e locacao.</p>
<hr>`;

  body.forEach((linha, idx) => {
    html += `\n<article>\n<h2>Imovel ${idx + 1}</h2>\n<ul>\n`;
    headers.forEach((header, i) => {
      const valor = (linha[i] || "").trim();
      if (valor !== "") {
        html += `<li><strong>${escapeHtml(header)}:</strong> ${escapeHtml(valor)}</li>\n`;
      }
    });
    html += `</ul>\n</article>\n<hr>`;
  });

  // Versao em tabela tambem (redundancia ajuda o crawler)
  html += `\n<h2>Tabela completa</h2>\n<table border="1">\n<thead><tr>`;
  headers.forEach(h => {
    html += `<th>${escapeHtml(h)}</th>`;
  });
  html += `</tr></thead>\n<tbody>\n`;
  body.forEach(linha => {
    html += `<tr>`;
    headers.forEach((_, i) => {
      html += `<td>${escapeHtml(linha[i] || "")}</td>`;
    });
    html += `</tr>\n`;
  });
  html += `</tbody>\n</table>\n</body>\n</html>`;

  return html;
}

module.exports = async function handler(req, res) {
  try {
    const response = await fetch(CSV_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CarteiraBot/1.0)" }
    });

    if (!response.ok) {
      throw new Error(`Falha ao buscar planilha: ${response.status}`);
    }

    const csv = await response.text();
    const rows = parseCSV(csv);
    const html = buildHtml(rows);

    // Cache de 10 minutos na edge da Vercel, revalidacao em background
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send(`<h1>Erro ao carregar carteira</h1><p>${escapeHtml(err.message)}</p>`);
  }
};