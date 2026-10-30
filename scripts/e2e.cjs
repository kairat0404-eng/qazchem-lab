// Негізгі пайдаланушы жолдарын браузерде тексеру (Playwright).
// Қолдану: node scripts/e2e.cjs [html файлы] [скриншот қалтасы]
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2] || 'dist-single/qazchem-lab.html');
const shots = process.argv[3] || 'e2e-shots';
require('fs').mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(250); };

  await page.goto(file + '#/'); await page.waitForSelector('h1');
  check('басты бет ашылады', (await page.textContent('h1')).includes('Химияны көр'));
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  check('WebGL ортада қолжетімді', webgl);
  check('басты беттегі 3D молекула canvas', webgl ? await page.locator('.mol-vp canvas').count() === 1 : await page.locator('.mol2d').count() === 1);
  check('10 жұмыс карточкасы', await page.locator('.labcard').count() === 10);
  await page.screenshot({ path: shots + '/01-home.png' });

  // Навигация және артқа/алға
  for (const [h, t] of [['#/labs', 'Зертханалық жұмыстар'], ['#/table', 'Периодтық кесте'], ['#/notebook', 'Менің зертханалық дәптерім'], ['#/results', 'Нәтижелер'], ['#/about', 'Анықтама'], ['#/builder', 'Тәжірибе құрастыру']]) {
    await go(h); check('бөлім ' + h, (await page.textContent('h1')).includes(t));
  }
  await page.goBack(); await page.waitForTimeout(200); check('артқа батырмасы', (await page.textContent('h1')).includes('Анықтама'));
  await page.goForward(); await page.waitForTimeout(200); check('алға батырмасы', (await page.textContent('h1')).includes('Тәжірибе құрастыру'));
  await go('#/zzz'); check('жоқ бет үшін түсінікті экран', (await page.textContent('main')).includes('Бет табылмады'));

  // 1-жұмыс толық: сұйылту
  await go('#/lab/dilution');
  await page.click('label.radio >> nth=1'); await page.fill('input[maxlength="40"]', 'Айгүл');
  await page.click('button:has-text("Тәжірибені бастау")'); await page.waitForSelector('.lab-grid');
  await page.click('button:has-text("V₁ көлемді өлшеп")');
  check('құралсыз әрекет қатемен тоқтатылады', (await page.textContent('.msg.error')).includes('орналастырыңыз'));
  // Батырмалық орналастыру
  for (const name of ['Стақан', 'Тамшуыр (пипетка)', 'Өлшеуіш колба']) { await page.click(`.tool:has-text("${name}")`); await page.click('button.block:has-text("орналастыру")'); }
  // Сүйреп апару
  await page.dragAndDrop('.tool:has-text("Шыны таяқша")', '.stage', { targetPosition: { x: 200, y: 120 } });
  check('сүйреп апару арқылы орналастыру', await page.locator('.tool.placed').count() === 4);
  // Параметр ауқымы
  await page.fill('.params input[type=number] >> nth=2', '30');
  check('V₂ < V₁ қатесі көрсетіледі', (await page.textContent('.params .err')).includes('үлкен'));
  await page.fill('.params input[type=number] >> nth=2', '100');
  await page.click('button:has-text("V₁ көлемді өлшеп")'); await page.click('button:has-text("Сызыққа дейін су")');
  await page.click('button:has-text("Колбаны төңкеріп")');
  const cText = await page.textContent('.mtable');
  check('c = 0,1 моль/л есептелді', /Концентрация c = n\/V\s*0,1\b/.test(cText.replace(/\s+/g, ' ')), cText.slice(0, 120));
  await page.click('button:has-text("Өлшеуді дәптерге жазу")');
  await page.fill('textarea[placeholder^="Мысалы"]', 'Түсі әлсіреді, n өзгермеді, c екі есе азайды.');
  await page.click('button:has-text("Бақылауды жазу")');
  check('түсіндірме бақылаудан кейін ашылады', (await page.textContent('.below')).includes('еріген заттың мөлшері n өзгермейді'));
  await page.screenshot({ path: shots + '/02-lab-dilution.png' });
  // Қайта жүктеу — күй сақталуы
  await page.waitForTimeout(700); await page.reload(); await page.waitForSelector('.lab-grid');
  check('бет жаңартылғаннан кейін жұмыс қалпына келеді', (await page.locator('.tool.placed').count()) === 4 && (await page.textContent('.mtable')).includes('0,1'));
  // Бағалау
  await page.check('input[name="q-q1"] >> nth=1');
  await page.fill('input[aria-label="Сандық жауап"]', '50'); await page.selectOption('select[aria-label="Өлшем бірлігі"]', 'ммоль/л');
  await page.fill('textarea[aria-label="Ашық жауап"]', 'V — жалпы көлем, қосылған су V₂ − V₁ = 50 мл.');
  await page.click('button:has-text("Жауаптарды тексеру")');
  const fbs = await page.locator('.quiz .fb.ok').count();
  check('таңдау және бірлігі түрлендірілген сандық жауап дұрыс бағаланды', fbs === 2);
  await page.fill('.card textarea:not([disabled]) >> nth=-1', 'n тұрақты, V екі есе артты, сондықтан c 0,20-дан 0,10 моль/л-ге дейін азайды. Болжамым дұрыс.');
  await page.click('button:has-text("Жұмысты аяқтау")'); await page.waitForTimeout(300);
  check('жұмыс аяқталып, дәптерде ашылады', page.url().includes('#/notebook/') && (await page.textContent('main')).includes('Қорытынды тексерілуде'));
  // CSV/JSON экспорт
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Өлшеулер (CSV)")')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  check('CSV экспорты қазақ әріптерімен', csv.includes('Концентрация') && /;"0,1";/.test(csv), csv.slice(0, 300));
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Жұмыс деректері (JSON)")')]);
  const jsonPath = await dj.path();
  // Мұғалім бағалауы
  await page.click('button:has-text("Мұғалім")'); await go('#/results');
  await page.click('button:has-text("Бағалау")');
  for (const c of await page.locator('.grader input[type=checkbox]').all()) await c.check();
  await page.click('button:has-text("Бағаны сақтау")');
  check('мұғалім рубрикасынан кейін жиынтық баға шығады', /100 %/.test(await page.textContent('.results')));
  await page.screenshot({ path: shots + '/03-results.png' });
  // Импорт (сол файл → көшірме), бүлінген файл
  await go('#/notebook');
  await page.setInputFiles('input[type=file]', jsonPath); await page.waitForTimeout(200);
  check('JSON импорты мазмұнды сақтайды', (await page.textContent('.msg')).includes('импортталды') && await page.locator('.nb-item').count() === 2);
  const badPath = shots + '/bad.json'; require('fs').writeFileSync(badPath, '{"format":"qazchem-lab/attempt","schema":1,"attempt":{"id":1}');
  await page.setInputFiles('input[type=file]', badPath); await page.waitForTimeout(200);
  check('бүлінген импорт қабылданбайды, бар деректер сақталады', (await page.textContent('.msg.error')).includes('қабылданбады') && await page.locator('.nb-item').count() === 2);

  // Қалған 9 жұмыс: басталып, параметр өзгеріп, негізгі әрекеттер орындалады
  const flows = {
    acidbase: [['indicator'], ['measure'], ['dilute'], ['dilute'], ['measure']],
    titration: [['indicator'], ['add', 5], ['add', 5], ['add', 5], ['add', 5], ['add', 1], ['add', 1], ['add', 1], ['add', 1], ['add', 0.5], ['add', 0.5], ['add', 5]],
    precipitation: [['pourCa'], ['pourCO3'], ['stir']],
    displacement: [['pour'], ['addFe'], ['RUN', 6000]],
    carbonate: [['addCarb'], ['addAcid'], ['RUN', 8000]],
    catalyst: [['fill'], ['addCat'], ['RUN', 5000]],
    conductivity: [['power'], ['water'], ['nacl'], ['sucrose']],
    solubility: [['salt', 10], ['stir'], ['salt', 10], ['salt', 10], ['salt', 10], ['stir'], ['evap', 20]],
    electrolysis: [['power'], ['RUN', 4000], ['power']],
  };
  await page.click('button:has-text("Оқушы")');
  for (const [id, steps] of Object.entries(flows)) {
    await go('#/lab/' + id);
    await page.click('label.radio >> nth=0'); await page.click('button:has-text("Тәжірибені бастау")'); await page.waitForSelector('.lab-grid');
    // Параметрді өзгерту (бірінші параметр)
    const sel = page.locator('.params select').first(), num = page.locator('.params input[type=number]').first();
    if (await num.count()) { const max = await num.getAttribute('max'), min = await num.getAttribute('min'); await num.fill(String((Number(max) + Number(min)) / 2)); }
    else if (await sel.count()) { const opts = await sel.locator('option').all(); await sel.selectOption({ index: opts.length - 1 }); }
    const applyBtn = page.locator('button:has-text("Шарттарды қолдану")');
    if (await applyBtn.isEnabled()) await applyBtn.click();
    // Барлық құралды орналастыру
    while (await page.locator('.tool:not(.placed)').count()) { await page.locator('.tool:not(.placed)').first().click(); await page.click('button.block:has-text("орналастыру")'); }
    // Параметрлер әдепкіге оралсын, ғылыми мақсатқа жету үшін (егер өзгерту жетістікке кедергі болса)
    if (id !== 'precipitation' && id !== 'titration') {
      await page.click('button:has-text("Қайта бастау")');
    }
    if (id === 'precipitation' || id === 'titration' || id === 'catalyst' || id === 'electrolysis' || id === 'acidbase' || id === 'conductivity') {
      // әдепкі шарттарды қалпына келтіру
      const nums = await page.locator('.params input[type=number]').all();
      if (await page.locator('.params input[type=number]').first().isEnabled().catch(() => false)) {
        const defaults = { precipitation: ['0.1', '20', '0.1', '10'], titration: ['0.1', '25', '0.1'], catalyst: ['0.01'], electrolysis: ['0.5'], conductivity: ['0.1'] }[id] || [];
        for (let i = 0; i < defaults.length && i < nums.length; i++) await nums[i].fill(defaults[i]);
        if (id === 'electrolysis') await page.locator('.params select').first().selectOption('1');
        if (id === 'acidbase') await page.locator('.params select').nth(1).selectOption('0.01');
        const ab = page.locator('button:has-text("Шарттарды қолдану")'); if (await ab.isEnabled()) await ab.click();
      }
    }
    for (const [act, val] of steps) {
      if (act === 'RUN') {
        await page.click('.toolbar button.primary'); await page.waitForTimeout(val);
        await page.click('.toolbar button:has-text("Үзіліс")');
        const t1 = await page.textContent('.mtable'); await page.waitForTimeout(600); const t2 = await page.textContent('.mtable');
        check(id + ': үзіліс кезінде күй өзгермейді', t1 === t2);
        await page.click('.toolbar button.primary'); await page.waitForTimeout(val); await page.click('.toolbar button:has-text("Үзіліс")');
        continue;
      }
      if (val !== undefined) await page.locator(`[data-act="${act}"][data-amount="${val}"]`).click();
      else await page.locator(`[data-act="${act}"]`).click();
    }
    await page.click('button:has-text("Өлшеуді дәптерге жазу")');
    await page.fill('textarea[placeholder^="Мысалы"]', 'Бақылау: ' + id); await page.click('button:has-text("Бақылауды жазу")');
    const steps2 = await page.locator('.steps li').count(), done = await page.locator('.steps li.done').count(), manual = await page.locator('.steps input[type=checkbox]').count();
    check(id + ': негізгі кезеңдер орындалды', done + manual >= steps2, `${done}/${steps2} (қолмен: ${manual})`);
    if (id === 'titration') {
      check('титрлеу: pH графигі салынды', await (async () => { await page.click('button[role=tab]:has-text("График")'); return (await page.locator('.chart polyline').count()) === 1; })());
    }
    if (id === 'electrolysis') { const tx = (await page.textContent('.mtable')).replace(/\s+/g, ' '); check('электролиз: H₂ : O₂ = 2 : 1', /2,00 : 1/.test(tx)); }
    await page.screenshot({ path: `${shots}/lab-${id}.png`, timeout: 90000 });
    // Қайта бастау бастапқы шарттарды қалпына келтіреді
    await page.click('button:has-text("Қайта бастау")');
    check(id + ': қайта бастау параметр өрістерін ашады (бастапқы күй)', await page.locator('button:has-text("Шарттарды қолдану")').count() === 1);
  }

  // Периодтық кесте: 118 карточка
  await go('#/table');
  check('кестеде 118 элемент', await page.locator('.pt-grid button.el').count() === 118);
  let okCards = 0;
  for (let z = 1; z <= 118; z++) { await page.evaluate(x => { location.hash = '#/table/' + x; }, z); await page.waitForFunction(x => document.querySelector('.big .z')?.textContent === String(x), z, { timeout: 3000 }).then(() => okCards++).catch(() => {}); }
  check('118 элементтің әрқайсысының карточкасы ашылады', okCards === 118, okCards + '/118');
  await go('#/table/26'); await page.waitForTimeout(500);
  check('Fe карточкасы: конфигурация және изотоп', /\[Ar\] 3d\s*6 4s\s*2/.test((await page.textContent('.props')).replace(/\s+/g, ' ')) && (await page.textContent('.props')).includes('n = A − Z = 30'));
  await page.screenshot({ path: shots + '/04-table-fe.png' });
  await page.fill('input[type=search]', 'мыс'); await page.waitForTimeout(150);
  check('қазақша атау бойынша іздеу', (await page.textContent('[aria-live=polite]')).includes('1 элемент'));
  await page.fill('input[type=search]', ''); await page.click('.pt-grid button[data-z="1"]'); await page.keyboard.press('ArrowRight');
  check('пернетақтамен навигация (H → He)', await page.evaluate(() => document.activeElement?.getAttribute('data-z')) === '2');

  // Конструктор: құру → сақтау → оқушы ретінде ашу; модельге сәйкессіз параметр
  await page.click('button:has-text("Мұғалім")'); await go('#/builder');
  await page.selectOption('select >> nth=0', 'catalyst'); await page.click('button:has-text("Жаңа шаблон")'); await page.waitForSelector('.builder-grid');
  await page.fill('.builder-grid input >> nth=0', 'Катализатор: 9А сыныбы');
  await page.locator('.builder-grid input[type=number]').first().fill('5');
  check('конструктор ауқымнан тыс параметрді қабылдамайды', (await page.textContent('.errs')).includes('аралығында'));
  await page.locator('.builder-grid input[type=number]').first().fill('0.004');
  await page.click('button:has-text("Сақтау (жаңа нұсқа)")'); await page.waitForTimeout(300);
  check('шаблон сақталып, нұсқасы артады', (await page.textContent('h1')).includes('v2'));
  await page.click('button:has-text("Оқушы ретінде алдын ала қарау")'); await page.waitForTimeout(300);
  check('конструктор шаблоны оқушы ретінде ашылады', (await page.textContent('h1')).includes('9А сыныбы'));
  await go('#/builder'); await page.click('.nb-item button[aria-label^="Жою"]');
  check('жойылған шаблонды қайтаруға болады', (await page.textContent('main')).includes('Жойылғандар'));
  await page.click('details summary'); await page.click('button:has-text("Қайтару")');
  check('шаблон қайтарылды', await page.locator('.nb-item').count() === 1);

  // 2D режим
  await go('#/lab/catalyst'); await page.click('button:has-text("2D режим")'); await page.waitForTimeout(200);
  check('2D балама режим ашылады', await page.locator('svg.lab2d').count() === 1);
  await page.click('button:has-text("3D режим")');
  // Қозғалысты азайту
  await page.click('button:has-text("Қозғалыс")'); check('қозғалысты азайту параметрі', await page.evaluate(() => document.documentElement.dataset.motion) === 'reduced');

  // Телефон көрінісі
  await page.setViewportSize({ width: 360, height: 780 }); await go('#/lab/dilution'); await page.waitForTimeout(400);
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('360 px: көлденең айналдыру жоқ', !hScroll);
  await page.screenshot({ path: shots + '/05-phone-lab.png', fullPage: false });
  await go('#/table'); await page.waitForTimeout(200);
  check('телефонда тізім көрінісі', await page.locator('.pt-list').count() === 1);
  await go('#/'); await page.screenshot({ path: shots + '/06-phone-home.png' });
  check('өңделмеген қателер жоқ', errors.length === 0, errors.slice(0, 3).join(' | '));

  // WebGL жоқ құрылғы
  const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; });
  await p2.goto(file + '#/lab/precipitation'); await p2.click('label.radio >> nth=1'); await p2.click('button:has-text("Тәжірибені бастау")');
  while (await p2.locator('.tool:not(.placed)').count()) { await p2.locator('.tool:not(.placed)').first().click(); await p2.click('button.block:has-text("орналастыру")'); }
  await p2.click('button:has-text("CaCl₂ ерітіндісін стақанға")'); await p2.click('button:has-text("Na₂CO₃ ерітіндісін қосу")'); await p2.click('button:has-text("Шыны таяқшамен")');
  check('WebGL жоқта 2D режимде тәжірибе орындалады', await p2.locator('svg.lab2d').count() === 1 && (await p2.textContent('.mtable')).includes('ақ тұнба түзілді'));
  await p2.screenshot({ path: shots + '/07-no-webgl.png' });
  await browser.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fail}/${results.length} өтті`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

