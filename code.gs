// --- CONFIGURAÇÃO ---
const SPREADSHEET_ID = "1KNF9fevg4vebTV2vEa3ucbasJIo1a4_WSMwrCIBxNVo"; 
const SHEET_NAME = "ERP_Database";
const IMAGE_FOLDER_NAME = "StyleERP_Images_Repo";

// Função para testar conexão e destravar permissões
function AUTORIZAR_SISTEMA() {
  const s = SpreadsheetApp.openById(SPREADSHEET_ID);
  const d = DriveApp.getRootFolder();
  console.log("Conectado com sucesso a: " + s.getName());
}

function doGet() {
  // ATENÇÃO: Agora ele chama 'index' (minúsculo)
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Style ERP Manager')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// --- 1. DASHBOARD ---
function getDashboardData() {
  try {
    SpreadsheetApp.flush(); // Garante que dados recém-salvos sejam lidos

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetNameToCheck = ss.getName();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    // Se não achar a aba, retorna vazio
    if (!sheet) return { collections: [], stats: { total: 0, used: 0 }, sheetName: sheetNameToCheck, debug: "Aba não encontrada" };

    const lastRow = sheet.getLastRow();
    
    // Se só tiver cabeçalho (linha 1), retorna vazio
    if (lastRow <= 1) return { collections: [], stats: { total: 0, used: 0 }, sheetName: sheetNameToCheck, debug: "Aba vazia" };

    // Lê os dados da linha 2 até o fim
    const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    const collections = {};
    let totalLooks = 0;
    let usedLooks = 0;

    data.forEach(r => {
      // Verifica se a Coluna A (ID) existe
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

    return { 
      collections: Object.values(collections), 
      stats: { total: totalLooks, used: usedLooks },
      sheetName: sheetNameToCheck 
    };

  } catch (e) {
    return { error: e.toString(), collections: [], stats: { total: 0, used: 0 } };
  }
}

// --- 2. DETALHES ---
function getCollectionDetails(collectionId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  
  const imgCache = {};
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
        rowIndex: i + 2, // Ajuste de índice (Linha 2 = index 0 + 2)
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

// --- 3. CRIAÇÃO ---
function createNewCollection(form) {
  try {
    let folder;
    const folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
    if (folders.hasNext()) folder = folders.next();
    else folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);

    const saveImg = (dataUrl, prefix) => {
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

    combinations.sort(() => Math.random() - 0.5);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    // Cria aba ou cabeçalho se faltar
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

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 11).setValues(rows);
    SpreadsheetApp.flush(); // Força salvamento
    return { success: true };

  } catch (e) { return { success: false, error: e.toString() }; }
}

// --- 4. AÇÕES ---
function setStatus(rowIndex, newStatus) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  sheet.getRange(rowIndex, 10).setValue(newStatus);
  return { success: true };
}

function deleteCollection(colId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === colId) sheet.deleteRow(i + 1);
  }
  SpreadsheetApp.flush();
  return { success: true };
}
