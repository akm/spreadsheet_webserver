// https://script.google.com/a/tecowl.co.jp/d/1JyCH00xFvtJ9LhirqREgFHKn9hrZhUZO0Ghgnt6t2uZiwmgGfmjW46nC/edit

// https://developers.google.com/apps-script/guides/web
// https://developers.google.com/apps-script/reference/spreadsheet/sheet
// https://developers.google.com/apps-script/reference/script/script-app

function doGet(e) {
  Logger.log("doGet %s", e);
  var sheet;
  try {
    sheet = getSheetBy(e.parameter);
  } catch(err) {
    return ContentService.createTextOutput('{"error": "' + err + '"}');
  }
  var data = getData(sheet, e.parameter.q);
  return ContentService.createTextOutput(JSON.stringify(data, null, 2))
  .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  Logger.log("doPost %s", e);
  var sheet;
  try {
    sheet = getSheetBy(e.parameter);
  } catch(err) {
    return ContentService.createTextOutput('{"error": "' + err + '"}');
  }

  const method = (e.parameter.method || 'POST').toUpperCase();

  try {
    // https://developers.google.com/apps-script/guides/web
    switch (e.parameter.method) {
    case 'POST':
      var payload = JSON.parse(e.postData.contents);
      var id = getID(e, sheet, payload, generateID);
      payload[e.parameter.id_name] = id.value;
      return insertRow(sheet, payload);
    case 'PUT', 'PATCH':
      var payload = JSON.parse(e.postData.contents);
      var id = getID(e, sheet, payload);
      return updateRow(sheet, id, payload);
    case 'DELETE':
      var id = getID(e, sheet);
      return deleteRow(sheet, id);
    default:
      throw new Error("No method parameter given");
    }
  } catch(err) {
    return ContentService.createTextOutput('{"error": "' + err + '"}');
  }
}

function getID(e, sheet, obj, generator) {
  var idName = e.parameter.id_name;
  if (!idName) {
    throw new Error("Neither id_index nor id_name given")
  }
  var idValue = generator ? generator(sheet, e.parameter.id_gen, e.parameter.id_value) : e.parameter.id_value;
  return {
    name: idName,
    index: getIDIndex(sheet, idName),
    value: idValue || getIDValue(obj, idName)
  };
}

function getIDIndex(sheet, idName) {
  var columnNames = sheet.getDataRange().getValues()[0];
  var r = columnNames.indexOf(idName);
  if (r < 0) {
    throw new Error(idName + " not found in first row")
  }
  return r
}

function getIDValue(obj, idName) {
  var r = obj ? obj[idName] : null;
  if (!r) {
    throw new Error("No " + idName + " value found in " + (obj || "null"));
  }
  return r
}

function generateID(sheet, generator, defaultValue) {
  if (!generator) {
    return defaultValue;
  }

  switch (generator.toLowerCase()) {
  case 'uuid':
    return Utilities.getUuid();
  case 'maxrows+1':
    return sheet.getMaxRows() + 1;
  case 'gen':
  case 'maxrows-frozenrows+1':
    return sheet.getMaxRows() - getHeaderRows(sheet) + 1;
  default:
    throw new Error("Unsupported ID generator named " + generator);
  }
}

function getSheetBy(parameter) {
  Logger.log("doGet e.parameter %s", parameter);
  var spreadsheetName = parameter.spreadsheet;
  Logger.log("doGet spreadsheetName %s", spreadsheetName);
  if (!spreadsheetName) {
    throw new Error("no spreadsheet given");
  }
  var spreadsheet =  SpreadsheetApp.openById(spreadsheetName);
  if (!spreadsheet) {
    throw new Error('Spreadsheet ' + spreadsheetName + ' not found');
  }
  var sheetName = parameter.sheet;
  Logger.log("doGet sheetName %s", sheetName);
  if (!sheetName) {
    throw new Error("no sheet given");
  }
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet ' + sheetName + ' not found');
  }
  return sheet;
}

function getData(sheet, query) {
  var rows = sheet.getDataRange().getValues();
  var columnNames = getColumnNames(sheet);
  rows.splice(0, getHeaderRows(sheet));
  return rows.filter(function(row) {
    if (!query) return true;
    return row.join(':::').toLowerCase().indexOf(query.toLowerCase()) !== -1;
  }).map(function(row) {
    var obj = {};
    row.map(function(item, index) {
      obj[columnNames[index]] = item;
    });
    return obj;
  });
}


function getHeaderRows(sheet) {
  var r = sheet.getFrozenRows();
  return r > 0 ? r : 1; // The first row must be header.
}

function getColumnNames(sheet){
  // Base index of column or row is not 0 but 1.
  var range = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
  return range.getValues()[0];
}

function newRow(sheet, payload) {
  var columnNames = getColumnNames(sheet);
  return columnNames.map(function(col){ return payload[col] })
}

function insertRow(sheet, payload) {
  sheet.appendRow(newRow(sheet, payload));
  return payload;
}

function getRowIndex(sheet, id) {
  var headerRows = getHeaderRows(sheet);
  var range = sheet.getRange(headerRows + 1, id.index, sheet.getMaxRows());
  var values = range.getValues().map(function(row){ return row[0] });
  var r = values.indexOf(id.value);
  return r < 0 ? -1 : r + headerRows + 1;
}

function getObjectByRowIndex(sheet, rowIndex) {
  var range = sheet.getRange(rowIndex, 1, 1, sheet.getMaxRows());
  var values = range.getValues()[0];
  var columnNames = getColumnNames(sheet);
  var r = {}
  columnNames.forEach(function(key, i){
    r[key] = values[i];
  });
  return r;
}

function findRowIndex(sheet, id) {
  var r = getRowIndex(sheet, id);
  if (r < 0) {
    throw new Error("Row not found for " + id.name + ": " + id.value);
  }
  return r
}

function updateRow(sheet, id, payload) {
  var obj = getObjectByRowIndex(sheet, rowIndex);
  for (var key in payload) {
    obj[key] = payload[key];
  }
  var rowIndex = findRowIndex(sheet, id);
  var range = sheet.getRange(rowIndex, 1, 1, sheet.getMaxRows());
  var row = newRow(sheet, obj);
  range.setValues(row);
  return obj;
}

function deleteRow(sheet, parameter) {
  var rowIndex = findRowIndex(sheet, id);
  var obj = getObjectByRowIndex(sheet, rowIndex);
  sheet.deleteRow(rowIndex);
  return obj;
}
