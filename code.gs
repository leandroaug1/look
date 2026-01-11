// --- CONFIGURAÇÃO ---
const SPREADSHEET_ID = "1KNF9fevg4vebTV2vEa3ucbasJIo1a4_WSMwrCIBxNVo"; 
const SHEET_NAME = "ERP_Database";
const IMAGE_FOLDER_NAME = "StyleERP_Images_Repo";

// --- ROTEAMENTO (API) ---

// Função que recebe as chamadas de LEITURA (GET)
function doGet(e) {
  // Se houver um parametro 'action', é uma chamada de API (JSON)
  if (e.parameter && e.parameter.action) {
    const action = e.parameter.action;
    let result = {};
    
    if (action === "getDashboard") {
      result = getDashboardData();
    } else if (action === "getDetails") {
      result = getCollectionDetails(e.parameter.id);
    }
    
    return responseJSON(result);
  }

  // Se não houver 'action', carrega a página HTML (caso acesse direto pelo link do script)
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Style ERP Manager')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Função que recebe as chamadas de ESCRITA (POST) - Faltava esta função!
function doPost(e) {
  try {
    // O frontend envia os dados como string JSON no corpo da requisição
    const data = JSON.parse(e.postData.contents);
    let result = {};

    if (data.action === "create") {
      result = createNewCollection(data);
    } else if (data.action === "setStatus") {
      result = setStatus(data.rowIndex, data.status);
    } else if (data.action === "delete") {
      result = deleteCollection(data.colId);
    }

    return responseJSON(result);

  } catch (err) {
    return responseJSON({ error: err.toString() });
  }
}

// Função auxiliar para formatar a resposta JSON e evitar erros de CORS no GitHub Pages
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// --- 1. LÓGICA DO DASHBOARD ---
function getDashboardData() {
  try {
    SpreadsheetApp.flush();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) return { collections: [], stats: { total: 0, used: 0 } };
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { collections: [], stats: { total: 0, used: 0 } };

    const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    const collections = {};
    let totalLooks = 0;
    let usedLooks = 0;

    data.forEach(r => {
      if (r[0] && r[0].toString().trim() !== "") {
        const [colId, colName, type, week, day, label, idA, idB, idC, status, date] = r;
        
        if (!collections[colId]) {
          collections[colId] = { id: colId, name: colName, type: type, count: 0, used: 0, date: date };
        }
        
        collections[colId].count++;
        totalLooks++;
        if (status === "USADO") {
          collections[colId].used++;
          usedLooks++;
        }
      }
    });
    return { collections: Object.values(collections), stats: { total: totalLooks, used: usedLooks } };
  } catch (e) {
    return { error: e.toString(), collections: [], stats: { total: 0, used: 0 } };
  }
}

// --- 2. LÓGICA DE DETALHES ---
function getCollectionDetails(collectionId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  const imgCache = {}; // Cache simples para evitar chamadas repetidas
  
  const getB64 = (id) => {
    if (!id) return null;
    if (imgCache[id]) return imgCache[id];
    try {
      const file = DriveApp.getFileById(id);
      const blob = file.getBlob();
      const b64 = Utilities.base64Encode(blob.getBytes());
      const res = `data:${blob.getContentType()};base64,${b64}`;
      imgCache[id] = res;
      return res;
    } catch (e) { return "https://via.placeholder.com/150?text=Erro"; }
  };

  const looks = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === collectionId) {
      looks.push({
        rowIndex: i + 2, 
        week: data[i][3],
        day: data[i][4],
        label: data[i][5],
        imgA: getB64(data[i][6]),
        imgB: getB64(data[i][7]),
        imgC: getB64(data[i][8]),
        status: data[i][9]
      });
    }
  }
  return looks;
}

// --- 3. CRIAÇÃO (SALVAR DADOS) ---
function createNewCollection(form) {
  try {
    let folder;
    const folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
    if (folders.hasNext()) folder = folders.next();
    else folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);

    const saveImg = (dataUrl, prefix) => {
      // Pequena validação para garantir que dataUrl é válido
      if (!dataUrl || !dataUrl.includes(",")) return "";
      const parts = dataUrl.split(",");
      const contentType = parts[0].split(":")[1].split(";")[0];
      const bytes = Utilities.base64Decode(parts[1]);
      const blob = Utilities.newBlob(bytes, contentType, `${prefix}_${Date.now()}`);
      return folder.createFile(blob).getId();
    };

    const listA = form.imgsA.map((b64, i) => ({ id: saveImg(b64, 'Top'), name: `A${i+1}` }));
    const listB = form.imgsB.map((b64, i) => ({ id: saveImg(b64, 'Bot'), name: `B${i+1}` }));
    let listC = [];
    if (form.mode === '3pc' && form.imgsC) {
      listC = form.imgsC.map((b64, i) => ({ id: saveImg(b64, 'Acc'), name: `C${i+1}` }));
    }

    let combinations = [];
    listA.forEach(itemA => {
      listB.forEach(itemB => {
        if (form.mode === '3pc') {
          listC.forEach(itemC => {
            combinations.push({ ids: [itemA.id, itemB.id, itemC.id], lbl: `${itemA.name}+${itemB.name}+${itemC.name}` });
          });
        } else {
          combinations.push({ ids: [itemA.id, itemB.id, ""], lbl: `${itemA.name}+${itemB.name}` });
        }
      });
    });
    
    // Embaralhar
    combinations.sort(() => Math.random() - 0.5);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["COL_ID", "COL_NAME", "TYPE", "WEEK", "DAY", "LABEL", "ID_A", "ID_B", "ID_C", "STATUS", "DATE_CREATED"]);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(["COL_ID", "COL_NAME", "TYPE", "WEEK", "DAY", "LABEL", "ID_A", "ID_B", "ID_C", "STATUS", "DATE_CREATED"]);
    }

    const colId = "COL_" + Utilities.getUuid().slice(0,8);
    const createDate = new Date();
    const rows = [];
    const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
    let d = 0, w = 1;
    
    combinations.forEach(combo => {
      rows.push([colId, form.name, form.mode, `Semana ${w}`, days[d], combo.lbl, combo.ids[0], combo.ids[1], combo.ids[2], "", createDate]);
      d++; if (d > 4) { d = 0; w++; }
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 11).setValues(rows);
    }
    
    SpreadsheetApp.flush();
    return { success: true };
    
  } catch (e) { 
    return { success: false, error: e.toString() };
  }
}

// --- 4. AÇÕES DE ATUALIZAÇÃO ---
function setStatus(rowIndex, newStatus) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    sheet.getRange(rowIndex, 10).setValue(newStatus);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function deleteCollection(colId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    // Deletar de baixo para cima para não bagunçar índices
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === colId) sheet.deleteRow(i + 1);
    }
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
