/**
 * MÓDULO FINANCIERO — CASO BANCO SIV  (v2 — fórmulas dinámicas)
 * Business Case · CaixaBank 2026 · Sergio Saravia
 *
 * Instrucciones:
 *  1. Abre script.google.com → Nuevo proyecto → pega este código
 *  2. Ejecuta  createFinancialModule()
 *  3. Edita las celdas AMARILLAS en la hoja VAN → todo se recalcula solo
 */

// ─── PALETA ───────────────────────────────────────────────────────────────────

const C = {
  DARK: '#1a1a2e', BLUE: '#0f3460', ACCENT: '#16213e',
  GOLD: '#e2b04a', GREEN: '#27ae60', RED: '#e74c3c',
  ORANGE: '#f39c12', WHITE: '#ffffff', LGRAY: '#f5f5f5',
  MGRAY: '#cccccc', INPUT: '#fff9c4',
};

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────

const ALTS = [
  { name: 'Alt 1: App Fintech Gen Z',
    inv: -8000000, revenues: [500000, 1800000, 4200000, 7500000, 11000000], wacc: 0.12 },
  { name: 'Alt 2: Alianza Neobank',
    inv: -3000000, revenues: [1200000, 2800000, 4500000, 6000000, 7500000], wacc: 0.10 },
  { name: 'Alt 3: Rediseño Digital',
    inv: -5000000, revenues: [800000, 2200000, 4000000, 6200000, 8500000], wacc: 0.11 },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function colLetter(n) { return String.fromCharCode(64 + n); }

function hdr(range, text, bg, fg, size) {
  range.setValue(text).setBackground(bg || C.BLUE).setFontColor(fg || C.WHITE)
    .setFontWeight('bold').setFontSize(size || 11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
}

function inp(range, value, fmt) {
  range.setValue(value).setBackground(C.INPUT).setFontWeight('bold');
  if (fmt) range.setNumberFormat(fmt);
}

// ── Reglas de formato condicional por lotes ──────────────────────────────────
// Acumula reglas y las aplica UNA sola vez al final de cada hoja.
// Esto evita el coste cuadrático de leer+escribir la lista en cada addCFRule.

let _cfRules = [];

function queueCF(range, formula, fg, bg) {
  const b = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula).setFontColor(fg);
  if (bg) b.setBackground(bg);
  _cfRules.push(b.setRanges([range]).build());
}

function flushCF(sh) {
  if (_cfRules.length) sh.setConditionalFormatRules(_cfRules);
  _cfRules = [];
}

// ─── MAPA DE CELDAS VAN ──────────────────────────────────────────────────────
// Cada alternativa ocupa 12 filas. baseRow (br) = 8 + ai*12
//   br+0: título  br+1: WACC INPUT(C)  br+2: cabeceras
//   br+3: Año 0 / Inversión INPUT(C)   br+4…br+8: Años 1-5 INPUT(C)
//   br+9: VAN TOTAL(F)  br+10: texto  br+11: espacio

function vanBR(ai)        { return 8 + ai * 12; }
function vanWACCcell(ai)  { return `C${vanBR(ai) + 1}`; }
function vanInvCell(ai)   { return `C${vanBR(ai) + 3}`; }
function vanRevRange(ai)  { const br = vanBR(ai); return `C${br+4}:C${br+8}`; }
function vanResultCell(ai){ return `F${vanBR(ai) + 9}`; }

// ─── HOJA VAN ────────────────────────────────────────────────────────────────

function createVAN(ss) {
  const sh = ss.insertSheet('VAN');
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 230);
  [3,4,5,6].forEach(c => sh.setColumnWidth(c, 155));

  sh.getRange('B1:F1').merge();
  hdr(sh.getRange('B1:F1'), '💰 VALOR ACTUAL NETO (VAN) — CASO BANCO SIV', C.DARK, C.GOLD, 14);
  sh.setRowHeight(1, 48);
  sh.getRange('B2:F2').merge()
    .setValue('VAN > 0 → crea valor · VAN < 0 → destruye valor · Modifica las celdas AMARILLAS')
    .setBackground(C.BLUE).setFontColor(C.WHITE).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange('B3:F3').merge()
    .setValue('Fórmula: VAN = −Inversión + Σ [ Flujo_t / (1 + WACC)^t ]')
    .setFontStyle('italic').setBackground(C.LGRAY).setHorizontalAlignment('center').setVerticalAlignment('middle');

  const COL_HDRS = ['Año','Flujo de Caja (€)','Factor Descuento','Flujo Descontado (€)','Flujo Acum. Desc. (€)'];

  ALTS.forEach((alt, ai) => {
    const br = vanBR(ai);

    sh.getRange(br, 2, 1, 5).merge();
    hdr(sh.getRange(br, 2), `📌 ${alt.name}`, C.ACCENT, C.GOLD, 11);
    sh.setRowHeight(br, 32);

    sh.getRange(br+1, 2).setValue('WACC (tasa descuento):').setFontWeight('bold');
    inp(sh.getRange(br+1, 3), alt.wacc, '0.0%');
    sh.getRange(br+1, 4).setValue('← modifica aquí').setFontColor('#888').setFontStyle('italic');

    COL_HDRS.forEach((h, i) => hdr(sh.getRange(br+2, 2+i), h, C.BLUE, C.WHITE, 10));

    // Año 0
    sh.getRange(br+3, 2).setValue(0);
    inp(sh.getRange(br+3, 3), alt.inv, '€#,##0');
    sh.getRange(br+3, 4).setValue(1).setNumberFormat('0.000');
    sh.getRange(br+3, 5).setFormula(`=C${br+3}`).setNumberFormat('€#,##0').setFontColor(C.RED);
    sh.getRange(br+3, 6).setFormula(`=E${br+3}`).setNumberFormat('€#,##0').setFontColor(C.RED);

    // Años 1-5: valores e inputs en batch
    const revVals   = alt.revenues.map(r => [r]);
    const yearVals  = alt.revenues.map((_, t) => [t+1]);
    sh.getRange(br+4, 2, 5, 1).setValues(yearVals);
    sh.getRange(br+4, 3, 5, 1).setValues(revVals).setBackground(C.INPUT).setNumberFormat('€#,##0').setFontWeight('bold');

    // Fórmulas columnas D, E, F en batch
    const fD = alt.revenues.map((_, t) => [`=1/(1+$C$${br+1})^${t+1}`]);
    const fE = alt.revenues.map((_, t) => [`=C${br+4+t}*D${br+4+t}`]);
    const fF = alt.revenues.map((_, t) => {
      const prev = t === 0 ? `E${br+3}` : `F${br+3+t}`;
      return [`=${prev}+E${br+4+t}`];
    });
    sh.getRange(br+4, 4, 5, 1).setFormulas(fD).setNumberFormat('0.000');
    sh.getRange(br+4, 5, 5, 1).setFormulas(fE).setNumberFormat('€#,##0');
    sh.getRange(br+4, 6, 5, 1).setFormulas(fF).setNumberFormat('€#,##0');

    // Colores de fila alternados (solo filas, INPUT se sobreescribe después)
    for (let t = 0; t < 5; t++) {
      sh.getRange(br+4+t, 2, 1, 5).setBackground(t % 2 === 0 ? C.LGRAY : C.WHITE);
    }
    sh.getRange(br+4, 3, 5, 1).setBackground(C.INPUT);

    // VAN TOTAL
    const vanRow = br + 9;
    sh.getRange(vanRow, 2, 1, 4).merge().setValue('VAN TOTAL:')
      .setFontWeight('bold').setFontSize(13).setBackground(C.LGRAY);
    sh.getRange(vanRow, 6)
      .setFormula(`=NPV($C$${br+1},$C$${br+4}:$C$${br+8})+C${br+3}`)
      .setNumberFormat('€#,##0').setFontWeight('bold').setFontSize(13);

    queueCF(sh.getRange(vanRow, 6), `=${vanResultCell(ai)}>0`,  C.GREEN, '#d4edda');
    queueCF(sh.getRange(vanRow, 6), `=${vanResultCell(ai)}<=0`, C.RED,   '#f8d7da');

    sh.getRange(br+10, 2, 1, 5).merge()
      .setFormula(`=IF(${vanResultCell(ai)}>0,"✅ VIABLE: el proyecto genera valor presente positivo.","❌ NO VIABLE: el proyecto destruye valor.")`)
      .setFontWeight('bold');
    queueCF(sh.getRange(br+10, 2), `=${vanResultCell(ai)}>0`,  C.GREEN, null);
    queueCF(sh.getRange(br+10, 2), `=${vanResultCell(ai)}<=0`, C.RED,   null);
  });

  flushCF(sh);
}

// ─── HOJA TIR ────────────────────────────────────────────────────────────────

function createTIR(ss) {
  const sh = ss.insertSheet('TIR');
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 230);
  [3,4,5,6,7].forEach(c => sh.setColumnWidth(c, 145));

  sh.getRange('B1:G1').merge();
  hdr(sh.getRange('B1:G1'), '📈 TASA INTERNA DE RETORNO (TIR)', C.DARK, C.GOLD, 14);
  sh.setRowHeight(1, 48);
  sh.getRange('B2:G2').merge()
    .setValue('TIR > WACC → el proyecto crea valor. La TIR es la tasa que hace VAN = 0.')
    .setBackground(C.BLUE).setFontColor(C.WHITE).setHorizontalAlignment('center');
  sh.getRange('B3:G3').merge()
    .setValue('Los datos se toman de la hoja VAN. Cambia ingresos o WACC allí → la TIR se actualiza automáticamente.')
    .setFontStyle('italic').setBackground(C.LGRAY).setHorizontalAlignment('center');

  ['Alternativa','Inversión','TIR','WACC','Diferencial TIR−WACC','Decisión']
    .forEach((h, i) => hdr(sh.getRange(5, 2+i), h, C.BLUE, C.WHITE, 10));

  ALTS.forEach((alt, ai) => {
    const row = 6 + ai;
    const br  = vanBR(ai);

    sh.getRange(row, 2).setValue(alt.name).setFontWeight('bold');
    sh.getRange(row, 3).setFormula(`=ABS(VAN!${vanInvCell(ai)})`).setNumberFormat('€#,##0');
    sh.getRange(row, 4).setFormula(`=IFERROR(IRR(VAN!C${br+3}:C${br+8}),"N/A")`).setNumberFormat('0.0%').setFontWeight('bold');
    sh.getRange(row, 5).setFormula(`=VAN!${vanWACCcell(ai)}`).setNumberFormat('0.0%');
    sh.getRange(row, 6).setFormula(`=IFERROR(D${row}-E${row},"N/A")`).setNumberFormat('+0.0%;-0.0%').setFontWeight('bold');
    sh.getRange(row, 7).setFormula(`=IF(ISNUMBER(D${row}),IF(D${row}>E${row},"✅ VIABLE","❌ NO VIABLE"),"N/A")`).setFontWeight('bold');
    sh.getRange(row, 2, 1, 6).setBackground(ai % 2 === 0 ? C.LGRAY : C.WHITE);

    queueCF(sh.getRange(row, 4), `=D${row}>E${row}`, C.GREEN, null);
    queueCF(sh.getRange(row, 4), `=AND(ISNUMBER(D${row}),D${row}<=E${row})`, C.RED, null);
    queueCF(sh.getRange(row, 6), `=ISNUMBER(F${row})*(F${row}>0)`, C.GREEN, null);
    queueCF(sh.getRange(row, 6), `=ISNUMBER(F${row})*(F${row}<=0)`, C.RED, null);
  });

  sh.getRange('B10:G10').merge();
  hdr(sh.getRange('B10:G10'), '💡 Regla: TIR > Costo de Capital → APROBAR el proyecto', '#fff3cd', C.DARK, 11);
  flushCF(sh);
}

// ─── HOJA ROI ────────────────────────────────────────────────────────────────

function createROI(ss) {
  const sh = ss.insertSheet('ROI');
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 230);
  [3,4,5,6,7,8].forEach(c => sh.setColumnWidth(c, 145));

  sh.getRange('B1:H1').merge();
  hdr(sh.getRange('B1:H1'), '💹 RETORNO SOBRE LA INVERSIÓN (ROI)', C.DARK, C.GOLD, 14);
  sh.setRowHeight(1, 48);
  sh.getRange('B2:H2').merge()
    .setValue('ROI = (Ingresos Totales − Inversión) / Inversión · No considera el valor temporal del dinero.')
    .setBackground(C.BLUE).setFontColor(C.WHITE).setHorizontalAlignment('center');
  sh.getRange('B3:H3').merge()
    .setValue('Datos referenciados de la hoja VAN. Cambia ingresos allí → ROI se actualiza.')
    .setFontStyle('italic').setBackground(C.LGRAY).setHorizontalAlignment('center');

  ['Alternativa','Inversión Total','Ingresos Totales (5a)','Beneficio Neto','ROI','Referencia']
    .forEach((h, i) => hdr(sh.getRange(5, 2+i), h, C.BLUE, C.WHITE, 10));

  ALTS.forEach((alt, ai) => {
    const row = 6 + ai;
    sh.getRange(row, 2).setValue(alt.name).setFontWeight('bold');
    sh.getRange(row, 3).setFormula(`=ABS(VAN!${vanInvCell(ai)})`).setNumberFormat('€#,##0');
    sh.getRange(row, 4).setFormula(`=SUM(VAN!${vanRevRange(ai)})`).setNumberFormat('€#,##0');
    sh.getRange(row, 5).setFormula(`=D${row}-C${row}`).setNumberFormat('€#,##0');
    sh.getRange(row, 6).setFormula(`=E${row}/C${row}`).setNumberFormat('0.0%').setFontWeight('bold');
    sh.getRange(row, 7).setFormula(`=IF(F${row}>1,"Excelente",IF(F${row}>0.5,"Bueno",IF(F${row}>0,"Aceptable","Negativo")))`);
    sh.getRange(row, 2, 1, 6).setBackground(ai % 2 === 0 ? C.LGRAY : C.WHITE);

    queueCF(sh.getRange(row, 6), `=F${row}>0.5`, C.GREEN, null);
    queueCF(sh.getRange(row, 6), `=AND(F${row}<=0.5,F${row}>0)`, C.ORANGE, null);
    queueCF(sh.getRange(row, 6), `=F${row}<=0`, C.RED, null);
  });

  flushCF(sh);
}

// ─── HOJA PAYBACK ────────────────────────────────────────────────────────────
// 11 filas por alt.  basePb = 4 + ai*11
// Resultado numérico: col D (para Dashboard)  Texto: col E

function paybackBR(ai)         { return 4 + ai * 11; }
function paybackResultCell(ai) { return `D${paybackBR(ai) + 9}`; }

function createPayback(ss) {
  const sh = ss.insertSheet('Payback');
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 230);
  [3,4,5,6].forEach(c => sh.setColumnWidth(c, 145));

  sh.getRange('B1:F1').merge();
  hdr(sh.getRange('B1:F1'), '⏱️ PERÍODO DE RECUPERACIÓN (PAYBACK)', C.DARK, C.GOLD, 14);
  sh.setRowHeight(1, 48);
  sh.getRange('B2:F2').merge()
    .setValue('Payback = años para recuperar la inversión. Menos años = mejor. Verde = recuperado.')
    .setBackground(C.BLUE).setFontColor(C.WHITE).setHorizontalAlignment('center');

  ALTS.forEach((alt, ai) => {
    const pbBR = paybackBR(ai);
    const br   = vanBR(ai);

    sh.getRange(pbBR, 2, 1, 5).merge();
    hdr(sh.getRange(pbBR, 2), `📌 ${alt.name}`, C.ACCENT, C.GOLD, 11);
    ['Año','Flujo de Caja (€)','Flujo Acumulado (€)','Estado']
      .forEach((h, i) => hdr(sh.getRange(pbBR+1, 2+i), h, C.BLUE, C.WHITE, 10));

    // Año 0
    sh.getRange(pbBR+2, 2).setValue(0);
    sh.getRange(pbBR+2, 3).setFormula(`=VAN!${vanInvCell(ai)}`).setNumberFormat('€#,##0').setFontColor(C.RED);
    sh.getRange(pbBR+2, 4).setFormula(`=C${pbBR+2}`).setNumberFormat('€#,##0').setFontColor(C.RED);
    sh.getRange(pbBR+2, 5).setValue('Inversión inicial').setFontStyle('italic').setFontColor('#888');

    // Años 1-5 en batch
    const yearVals = [[1],[2],[3],[4],[5]];
    const fC = Array.from({length:5}, (_,t) => [`=VAN!C${br+4+t}`]);
    const fD = Array.from({length:5}, (_,t) => {
      const prev = t === 0 ? `C${pbBR+2}` : `D${pbBR+2+t}`;
      return [`=${prev}+C${pbBR+3+t}`];
    });
    const fE = Array.from({length:5}, (_,t) => [`=IF(D${pbBR+3+t}>=0,"✅ Recuperado","⏳ Pendiente")`]);

    sh.getRange(pbBR+3, 2, 5, 1).setValues(yearVals);
    sh.getRange(pbBR+3, 3, 5, 1).setFormulas(fC).setNumberFormat('€#,##0');
    sh.getRange(pbBR+3, 4, 5, 1).setFormulas(fD).setNumberFormat('€#,##0');
    sh.getRange(pbBR+3, 5, 5, 1).setFormulas(fE);

    for (let t = 0; t < 5; t++) {
      sh.getRange(pbBR+3+t, 2, 1, 4).setBackground(t % 2 === 0 ? C.LGRAY : C.WHITE);
      queueCF(sh.getRange(pbBR+3+t, 4), `=D${pbBR+3+t}>=0`, C.GREEN, '#d4edda');
      queueCF(sh.getRange(pbBR+3+t, 4), `=D${pbBR+3+t}<0`,  C.RED,   null);
    }

    // Resultado payback
    const pbRow = pbBR + 9;
    sh.getRange(pbRow, 2, 1, 2).merge().setValue('⏱️ PAYBACK:').setFontWeight('bold').setFontSize(12);
    const r0 = pbBR+3, r4 = pbBR+7;
    sh.getRange(pbRow, 4)
      .setFormula(`=IFERROR(MATCH(TRUE,ARRAYFORMULA(D${r0}:D${r4}>=0),0),6)`)
      .setNumberFormat('0');
    sh.getRange(pbRow, 5)
      .setFormula(`=IF(D${pbRow}<6,D${pbRow}&" años",">5 años")`)
      .setFontWeight('bold').setFontSize(12);

    queueCF(sh.getRange(pbRow, 5), `=D${pbRow}<=3`, C.GREEN, '#d4edda');
    queueCF(sh.getRange(pbRow, 5), `=AND(D${pbRow}>3,D${pbRow}<=4)`, C.ORANGE, '#fff3cd');
    queueCF(sh.getRange(pbRow, 5), `=D${pbRow}>=5`, C.RED, '#f8d7da');
  });

  flushCF(sh);
}

// ─── HOJA SENSIBILIDAD ───────────────────────────────────────────────────────
// Tabla 7×7: WACC × Crecimiento. Ingresos referenciados de VAN.
// baseSens = 4 + ai*14

function createSensibilidad(ss) {
  const sh = ss.insertSheet('Sensibilidad');
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 110);
  for (let c = 3; c <= 10; c++) sh.setColumnWidth(c, 110);

  sh.getRange('B1:J1').merge();
  hdr(sh.getRange('B1:J1'), '🎯 ANÁLISIS DE SENSIBILIDAD — VAN según WACC × Crecimiento de Ingresos', C.DARK, C.GOLD, 14);
  sh.setRowHeight(1, 48);
  sh.getRange('B2:J2').merge()
    .setValue('Verde = VAN > 0 (viable) · Rojo = VAN < 0 (no viable). Ingresos referenciados de la hoja VAN.')
    .setBackground(C.BLUE).setFontColor(C.WHITE).setHorizontalAlignment('center');

  const WACCS   = [0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18];
  const GROWTHS = [0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30];

  ALTS.forEach((alt, ai) => {
    const bs = 4 + ai * 14;      // baseSens
    const br = vanBR(ai);        // baseRow en VAN

    sh.getRange(bs, 2, 1, 9).merge();
    hdr(sh.getRange(bs, 2), `📌 ${alt.name} — VAN (€K) según WACC × Crecimiento`, C.ACCENT, C.GOLD, 11);

    sh.getRange(bs+1, 2).setValue('WACC \\ Crecim.').setFontWeight('bold').setBackground(C.MGRAY);

    // Growth headers
    const growthHdrs = [GROWTHS.map(g => g)];
    sh.getRange(bs+1, 3, 1, 7).setValues(growthHdrs).setNumberFormat('0%')
      .setFontWeight('bold').setBackground(C.MGRAY).setHorizontalAlignment('center');

    // WACC labels en batch
    sh.getRange(bs+2, 2, 7, 1).setValues(WACCS.map(w => [w]))
      .setNumberFormat('0%').setFontWeight('bold').setBackground(C.MGRAY);

    // Fórmulas NPV en batch (7×7 = 49 celdas por alternativa → 1 sola escritura)
    const formulas = WACCS.map((w, wi) => {
      const wRow = bs + 2 + wi;
      return GROWTHS.map((g, gi) => {
        const dataCol = 3 + gi;
        const wRef  = `$B${wRow}`;
        const gRef  = `${colLetter(dataCol)}$${bs+1}`;
        const inv   = `VAN!$C$${br+3}`;
        const revs  = [br+4,br+5,br+6,br+7,br+8]
          .map((r, t) => `VAN!$C$${r}*(1+${gRef})^${t+1}`).join(',');
        return `=IFERROR(ROUND((NPV(${wRef},${revs})+${inv})/1000,0),0)`;
      });
    });
    sh.getRange(bs+2, 3, 7, 7).setFormulas(formulas).setNumberFormat('#,##0"K"')
      .setHorizontalAlignment('center');

    // CF rules para el bloque completo — una regla de rango en vez de 49 reglas individuales
    const dataBlock = sh.getRange(bs+2, 3, 7, 7);
    queueCF(dataBlock, `=C${bs+2}>0`,  C.WHITE, C.GREEN);
    queueCF(dataBlock, `=C${bs+2}<=0`, C.WHITE, C.RED);

    // Borde dorado en el caso base de cada alternativa
    WACCS.forEach((w, wi) => {
      if (Math.abs(w - alt.wacc) < 0.001) {
        GROWTHS.forEach((g, gi) => {
          if (Math.abs(g - 0.10) < 0.001) {
            sh.getRange(bs+2+wi, 3+gi).setBorder(true,true,true,true,null,null,
              C.GOLD, SpreadsheetApp.BorderStyle.SOLID_THICK);
          }
        });
      }
    });
  });

  flushCF(sh);
}

// ─── HOJA COMPARATIVA ────────────────────────────────────────────────────────

function createComparativa(ss) {
  const sh = ss.insertSheet('Comparativa');
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 220);
  [3,4,5,6,7].forEach(c => sh.setColumnWidth(c, 160));

  sh.getRange('B1:G1').merge();
  hdr(sh.getRange('B1:G1'), '🏆 TABLA COMPARATIVA FINAL — ALTERNATIVAS BANCO SIV', C.DARK, C.GOLD, 14);
  sh.setRowHeight(1, 48);
  sh.getRange('B2:G2').merge()
    .setValue('Todos los valores son dinámicos. Cambia parámetros en la hoja VAN → la tabla se actualiza.')
    .setBackground(C.BLUE).setFontColor(C.WHITE).setHorizontalAlignment('center');

  // Pesos
  sh.getRange('B4:G4').merge();
  hdr(sh.getRange('B4:G4'), '⚙️ Pesos del ranking ponderado (deben sumar 100%)', C.ACCENT, C.GOLD, 11);
  [['VAN','C',0.35],['TIR','D',0.20],['ROI','E',0.20],['Payback (inv.)','F',0.15],['Riesgo (inv.)','G',0.10]]
    .forEach(([lbl, col, val]) => {
      sh.getRange(`${col}5`).setValue(lbl).setFontWeight('bold').setHorizontalAlignment('center').setBackground(C.MGRAY);
      inp(sh.getRange(`${col}6`), val, '0%');
    });
  sh.getRange('B5').setValue('Criterio →').setFontWeight('bold');
  sh.getRange('B6').setValue('Peso:').setFontWeight('bold');

  ['Métrica','Unidad','Alt 1: App Fintech','Alt 2: Alianza Neobank','Alt 3: Rediseño Digital','Mejor']
    .forEach((h, i) => hdr(sh.getRange(8, 2+i), h, C.BLUE, C.WHITE, 10));

  const metrics = [
    ['Inversión Total','€', false,
      `=ABS(VAN!${vanInvCell(0)})`,`=ABS(VAN!${vanInvCell(1)})`,`=ABS(VAN!${vanInvCell(2)})`],
    ['VAN (5 años)','€', false,
      `=VAN!${vanResultCell(0)}`,`=VAN!${vanResultCell(1)}`,`=VAN!${vanResultCell(2)}`],
    ['TIR','%', false,
      `=IFERROR(TIR!D6,"N/A")`,`=IFERROR(TIR!D7,"N/A")`,`=IFERROR(TIR!D8,"N/A")`],
    ['ROI','%', false,
      `=ROI!F6`,`=ROI!F7`,`=ROI!F8`],
    ['Payback','años', true,
      `=Payback!${paybackResultCell(0)}`,`=Payback!${paybackResultCell(1)}`,`=Payback!${paybackResultCell(2)}`],
    ['WACC usado','%', false,
      `=VAN!${vanWACCcell(0)}`,`=VAN!${vanWACCcell(1)}`,`=VAN!${vanWACCcell(2)}`],
    ['Ingresos Totales 5a','€', false,
      `=SUM(VAN!${vanRevRange(0)})`,`=SUM(VAN!${vanRevRange(1)})`,`=SUM(VAN!${vanRevRange(2)})`],
  ];

  metrics.forEach(([label, unit, inverted, f0, f1, f2], ri) => {
    const row = 9 + ri;
    const fmt = {'€':'€#,##0','%':'0.0%','años':'0'}[unit] || '0';
    sh.getRange(row, 2).setValue(label).setFontWeight('bold');
    sh.getRange(row, 3).setValue(unit);
    [[4,f0],[5,f1],[6,f2]].forEach(([c, f]) => sh.getRange(row, c).setFormula(f).setNumberFormat(fmt));
    sh.getRange(row, 7).setFormula(
      `=INDEX({"Alt 1","Alt 2","Alt 3"},IFERROR(` +
      (inverted
        ? `MATCH(MIN(D${row},E${row},F${row}),{D${row},E${row},F${row}},0)`
        : `MATCH(MAX(D${row},E${row},F${row}),{D${row},E${row},F${row}},0)`) +
      `,1))`
    ).setFontColor(C.GREEN).setFontWeight('bold');
    sh.getRange(row, 2, 1, 6).setBackground(ri % 2 === 0 ? C.LGRAY : C.WHITE);
  });

  sh.getRange('B17:G17').merge();
  hdr(sh.getRange('B17:G17'),
    '🏆 RECOMENDACIÓN: Alternativa 2 — Alianza Neobank (menor inversión, payback más rápido, VAN positivo)',
    '#1a6b3c', C.WHITE, 12);
  sh.setRowHeight(17, 42);
}

// ─── HOJA DASHBOARD ──────────────────────────────────────────────────────────

function createDashboard(ss) {
  const sh = ss.insertSheet('Dashboard', 0);
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 220);
  [3,4,5,6,7,8].forEach(c => sh.setColumnWidth(c, 155));

  sh.getRange('B1:H1').merge();
  hdr(sh.getRange('B1:H1'), '📊 MÓDULO FINANCIERO — CASO BANCO SIV', C.DARK, C.GOLD, 18);
  sh.setRowHeight(1, 55);
  sh.getRange('B2:H2').merge()
    .setValue('Business Case · CaixaBank 2026 · Los valores se actualizan al cambiar parámetros en la hoja VAN')
    .setBackground(C.BLUE).setFontColor(C.WHITE).setFontSize(11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(2, 32);

  // Parámetros actuales
  sh.getRange('B4:H4').merge();
  hdr(sh.getRange('B4:H4'), '⚙️ PARÁMETROS ACTUALES (edita directamente en la hoja VAN)', C.ACCENT, C.GOLD, 12);
  sh.setRowHeight(4, 32);

  ['Alt 1','Alt 2','Alt 3'].forEach((lbl, ai) => {
    sh.getRange(5, 3+ai).setValue(lbl).setFontWeight('bold').setHorizontalAlignment('center').setBackground(C.MGRAY);
  });

  [
    ['WACC',      `=VAN!${vanWACCcell(0)}`,             `=VAN!${vanWACCcell(1)}`,             `=VAN!${vanWACCcell(2)}`,             '0.0%'],
    ['Inversión', `=ABS(VAN!${vanInvCell(0)})`,         `=ABS(VAN!${vanInvCell(1)})`,         `=ABS(VAN!${vanInvCell(2)})`,         '€#,##0'],
  ].forEach(([lbl, f0, f1, f2, fmt], i) => {
    const row = 6 + i;
    sh.getRange(row, 2).setValue(lbl).setFontWeight('bold').setBackground(C.LGRAY);
    [[3,f0],[4,f1],[5,f2]].forEach(([c, f]) =>
      sh.getRange(row, c).setFormula(f).setNumberFormat(fmt).setBackground(C.LGRAY));
  });

  // Tabla KPIs
  sh.getRange('B9:H9').merge();
  hdr(sh.getRange('B9:H9'), '📋 RESUMEN COMPARATIVO DE KPIs (actualización automática)', C.BLUE, C.WHITE, 12);
  ['Métrica','Alt 1: App Fintech','Alt 2: Alianza Neobank','Alt 3: Rediseño Digital','Mejor Alternativa']
    .forEach((h, i) => hdr(sh.getRange(10, 2+i), h, C.BLUE, C.WHITE, 10));

  const kpis = [
    ['VAN (5 años)', `=VAN!${vanResultCell(0)}`, `=VAN!${vanResultCell(1)}`, `=VAN!${vanResultCell(2)}`, '€#,##0'],
    ['TIR',         `=IFERROR(TIR!D6,"N/A")`,   `=IFERROR(TIR!D7,"N/A")`,   `=IFERROR(TIR!D8,"N/A")`,  '0.0%'],
    ['ROI',         `=ROI!F6`,                   `=ROI!F7`,                   `=ROI!F8`,                  '0.0%'],
    ['Payback',     `=Payback!${paybackResultCell(0)}&" años"`,
                    `=Payback!${paybackResultCell(1)}&" años"`,
                    `=Payback!${paybackResultCell(2)}&" años"`, '@'],
    ['Decisión',
      `=IF(VAN!${vanResultCell(0)}>0,"✅ VIABLE","❌ NO VIABLE")`,
      `=IF(VAN!${vanResultCell(1)}>0,"✅ VIABLE","❌ NO VIABLE")`,
      `=IF(VAN!${vanResultCell(2)}>0,"✅ VIABLE","❌ NO VIABLE")`, '@'],
  ];

  kpis.forEach(([lbl, f0, f1, f2, fmt], ri) => {
    const row = 11 + ri;
    sh.getRange(row, 2).setValue(lbl).setFontWeight('bold');
    [[3,f0],[4,f1],[5,f2]].forEach(([c, f]) =>
      sh.getRange(row, c).setFormula(f).setNumberFormat(fmt).setHorizontalAlignment('center'));
    if (ri < 3) {
      sh.getRange(row, 6).setFormula(
        `=INDEX({"Alt 1","Alt 2","Alt 3"},MATCH(MAX(C${row},D${row},E${row}),{C${row},D${row},E${row}},0))`
      ).setFontColor(C.GREEN).setFontWeight('bold');
    }
    sh.getRange(row, 2, 1, 5).setBackground(ri % 2 === 0 ? C.LGRAY : C.WHITE);
  });

  // CF condicional VAN fila (regla de bloque, no celda por celda)
  queueCF(sh.getRange(11, 3, 1, 3), `=C11>0`,  C.GREEN, '#d4edda');
  queueCF(sh.getRange(11, 3, 1, 3), `=C11<=0`, C.RED,   '#f8d7da');

  // Nota pedagógica
  sh.getRange('B17:H17').merge();
  hdr(sh.getRange('B17:H17'), '💡 CÓMO USAR ESTE MÓDULO', C.ACCENT, C.GOLD, 11);
  sh.getRange('B18:H21').merge()
    .setValue(
      '1️⃣  Ve a la hoja VAN → cambia el WACC (celda amarilla) → el VAN de cada alternativa se recalcula al instante.\n' +
      '2️⃣  Modifica los ingresos anuales (celdas amarillas en VAN) → TIR, ROI, Payback y Sensibilidad se actualizan solos.\n' +
      '3️⃣  Ve a la hoja Sensibilidad → tabla VAN para 7 WACCs × 7 tasas de crecimiento (verde = viable, rojo = no viable).\n' +
      '4️⃣  Las celdas AMARILLAS son los únicos inputs que debes editar. El resto son fórmulas.'
    ).setBackground(C.LGRAY).setWrap(true).setVerticalAlignment('top').setFontSize(10);
  sh.setRowHeights(18, 4, 26);

  flushCF(sh);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function createFinancialModule() {
  const ss = SpreadsheetApp.create('📊 Módulo Financiero BC — Banco SIV v2');
  ss.getSheetByName('Hoja 1').setName('_tmp');

  createVAN(ss);          // primero: los demás la referencian
  createTIR(ss);
  createROI(ss);
  createPayback(ss);
  createSensibilidad(ss);
  createComparativa(ss);
  createDashboard(ss);    // se inserta en posición 0

  ss.deleteSheet(ss.getSheetByName('_tmp'));
  ss.setActiveSheet(ss.getSheetByName('Dashboard'));

  SpreadsheetApp.getUi().alert(
    '✅ Módulo Financiero v2 creado.\n\n' +
    '📝 Edita las celdas AMARILLAS en la hoja VAN:\n' +
    '   • WACC de cada alternativa\n' +
    '   • Inversión inicial\n' +
    '   • Ingresos años 1–5\n\n' +
    '↻ Todo se recalcula automáticamente.\n\n' +
    'URL: ' + ss.getUrl()
  );
  Logger.log(ss.getUrl());
}
