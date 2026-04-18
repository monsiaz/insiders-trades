const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '/Users/simonazoulay/insiders-trades/.env' });
const https = require('https');
const pdfParse = require('pdf-parse');

process.chdir('/Users/simonazoulay/insiders-trades');
const prisma = new PrismaClient();

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const h = require('https');
    h.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return resolve(fetchBuf(res.headers.location));
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

function extractInsider(text) {
  const m = text.match(/NOM\s*\/\s*FONCTION[\s\S]{0,200}?LIEE\s*:\s*\n+([\s\S]*?)(?=\n\s*NOTIFICATION|\nCOORDONNEES)/i);
  if (!m) return { name: null, func: null };
  const raw = m[1].trim();
  const lie = raw.match(/li[eé]e?\s+à\s+([\w\s\-ÉÈÊËÀÂÙÛÎÏÔÇ]+?)(?:,\s*(.+?))?(?:\n|$)/i);
  if (lie) return { name: lie[1].trim().replace(/\s+/g,' '), func: lie[2]?.trim() || null };
  const comma = raw.indexOf(',');
  if (comma > 0) return { name: raw.substring(0,comma).trim(), func: raw.substring(comma+1).trim() || null };
  return { name: raw.split('\n')[0].trim().substring(0,120), func: null };
}

function parseNum(s) {
  if (!s) return null;
  const m = s.match(/[\d\s]+[.,][\d]+|[\d]+/);
  return m ? parseFloat(m[0].replace(/\s/g,'').replace(',','.')) : null;
}

function parseTrade(text) {
  const ef = (lbl) => { const m = text.match(new RegExp(lbl + '\\s*:\\s*(.+)', 'i')); return m ? m[1].trim() : null; };
  const { name, func } = extractInsider(text);
  const agSection = text.match(/INFORMATIONS AGREGEES\s*\n([\s\S]*?)(?=\nTRANSACTION|\nDATE DE RECEPTION|$)/i);
  let price = null, vol = null;
  if (agSection) {
    const pm = agSection[1].match(/PRIX\s*:\s*([\d\s.,]+(?:\s*Euro)?)/i);
    const vm = agSection[1].match(/VOLUME\s*:\s*([\d\s.,]+)/i);
    price = parseNum(pm?.[1]); vol = parseNum(vm?.[1]);
  }
  if (!price) price = parseNum(ef('PRIX UNITAIRE'));
  if (!vol) vol = parseNum(ef('VOLUME'));
  const dateRaw = ef('DATE DE LA TRANSACTION');
  const months = {janvier:1,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,septembre:9,octobre:10,novembre:11,décembre:12};
  let transDate = null;
  if (dateRaw) { const dm = dateRaw.match(/(\d{1,2})\s+([a-zéûôà]+)\s+(\d{4})/i); if(dm) transDate = new Date(parseInt(dm[3]),(months[dm[2].toLowerCase()]||1)-1,parseInt(dm[1])); }
  return {
    insiderName: name, insiderFunction: func,
    transactionNature: ef('NATURE DE LA TRANSACTION'),
    instrumentType: ef("DESCRIPTION DE L'INSTRUMENT FINANCIER"),
    isin: ef("CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER"),
    transactionVenue: ef('LIEU DE LA TRANSACTION'),
    unitPrice: price, volume: vol,
    totalAmount: price && vol ? Math.round(price*vol*100)/100 : null,
    currency: 'EUR', transactionDate: transDate, pdfParsed: true
  };
}

async function main() {
  const total = await prisma.declaration.count({ where: { type: 'DIRIGEANTS', pdfParsed: false } });
  console.log(`[START] Total to enrich: ${total}`);
  
  let processed = 0, success = 0, failed = 0;
  
  while (true) {
    const batch = await prisma.declaration.findMany({
      where: { type: 'DIRIGEANTS', pdfParsed: false },
      orderBy: { pubDate: 'desc' },
      take: 10,
      select: { id: true, amfId: true }
    });
    if (batch.length === 0) break;
    
    for (const d of batch) {
      try {
        const meta = JSON.parse((await fetchBuf('https://bdif.amf-france.org/back/api/v1/informations/' + d.amfId + '?lang=fr')).toString());
        const pdfDoc = (meta.documents||[]).find(x => x.accessible && x.nomFichier?.endsWith('.pdf'));
        if (!pdfDoc) { await prisma.declaration.update({where:{id:d.id},data:{pdfParsed:true}}); processed++; continue; }
        const pdfUrl = 'https://bdif.amf-france.org/back/api/v1/documents/' + pdfDoc.path;
        const parsed = await pdfParse(await fetchBuf(pdfUrl), {max:0});
        const trade = parseTrade(parsed.text);
        trade.pdfUrl = pdfUrl;
        await prisma.declaration.update({where:{id:d.id}, data: trade});
        success++;
      } catch(e) {
        await prisma.declaration.update({where:{id:d.id},data:{pdfParsed:true}});
        failed++;
      }
      processed++;
      await new Promise(r=>setTimeout(r,250));
    }
    
    if (processed % 50 === 0 || batch.length < 10) {
      const remaining = await prisma.declaration.count({ where: { type: 'DIRIGEANTS', pdfParsed: false } });
      console.log(`[PROGRESS] processed=${processed} success=${success} failed=${failed} remaining=${remaining}`);
    }
  }
  
  console.log(`[DONE] processed=${processed} success=${success} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
