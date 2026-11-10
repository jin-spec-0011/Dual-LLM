/* Dual LLM E2E: Chromium + API 모킹 (실제 키·네트워크 불필요)
 * 실행: node tests/e2e.mjs   (사전: 정적 서버로 저장소 루트를 서빙, BASE_URL 지정)
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.error('  ✗ ' + msg); } };

const gem = (text, inTok = 100, outTok = 200) => ({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok } }) });
const cla = (text, inTok = 100, outTok = 200) => ({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: inTok, output_tokens: outTok }, stop_reason: 'end_turn' }) });
const httpErr = (status, message) => ({ status, contentType: 'application/json', body: JSON.stringify({ error: { message } }) });

async function newPage(browser, handlers) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('dllm.settings.v1')) {
      localStorage.setItem('dllm.settings.v1', JSON.stringify({ gemKey: 'AIza-test', claKey: 'sk-ant-test', pGemIn: 2, pGemOut: 10, pClaIn: 4, pClaOut: 20, budget: 30 }));
    }
  });
  const page = await ctx.newPage();
  const calls = { gem: 0, cla: 0, bodies: [] };
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => { failed++; console.error('  ✗ pageerror: ' + e.message); });
  await page.route('**/generativelanguage.googleapis.com/**', route => { calls.gem++; calls.bodies.push(['gem', route.request().postData()]); route.fulfill(handlers.gem(calls.gem)); });
  await page.route('**/api.anthropic.com/**', route => { calls.cla++; calls.bodies.push(['cla', route.request().postData()]); route.fulfill(handlers.cla(calls.cla)); });
  await page.goto(BASE);
  return { ctx, page, calls };
}
async function runJob(page, { type = 'equip', problem = '3호기 슬롯다이 막두께 편차', title = '테스트 작업' } = {}) {
  await page.selectOption('#fType', type);
  await page.fill('#fTitle', title);
  await page.fill('#fProblem', problem);
  await page.click('#btnRun');
  await page.waitForFunction(() => !document.getElementById('btnRun').disabled, null, { timeout: 30000 });
}
const statusText = (page) => page.locator('#statusBox').innerText();

const browser = await chromium.launch();
try {
  console.log('A. 반려 → 재수정 → 조건부 통과 (2라운드, 비용 계산)');
  {
    const { ctx, page, calls } = await newPage(browser, {
      gem: () => gem('## 결론\n해결안'),
      cla: (n) => n === 1 ? cla('판정: 반려\n## 결함 표\n| 항목 | 심각도(치명/주요/경미) | 근거 | 수정안 |\n|---|---|---|---|\n| LOTO 누락 | 치명 | 안전 | 추가 |') : cla('**판정: 조건부 통과**\n## 결함 표')
    });
    await runJob(page);
    ok(await page.locator('.round').count() === 2, '라운드 2개 생성');
    const st = await statusText(page);
    ok(st.includes('조건부 통과'), '최종 판정 조건부 통과 표시');
    ok(st.includes('$0.0132'), '누적 비용 $0.0132 (Gemini 2회 + Claude 2회)');
    ok(calls.gem === 2 && calls.cla === 2, 'API 호출 횟수 gem 2 / cla 2');
    const r2 = calls.bodies.filter(b => b[0] === 'gem')[1][1];
    ok(r2.includes('[검증자 지적사항]') && r2.includes('LOTO 누락'), '2라운드 해결 프롬프트에 검증자 지적 포함');
    ok(await page.locator('#postBox').isVisible(), '사후 평가 박스 표시');
    await ctx.close();
  }
  console.log('B. 판정 불명 → 사람 판단');
  {
    const { ctx, page } = await newPage(browser, { gem: () => gem('해결안'), cla: () => cla('좋은 해결안입니다.') });
    await runJob(page);
    ok((await statusText(page)).includes('판정 불명'), '판정 불명 → 사람 판단 상태');
    ok(await page.locator('.round').count() === 1, '1라운드에서 중단');
    await ctx.close();
  }
  console.log('C. 2회 반려 → 사람 판단');
  {
    const { ctx, page } = await newPage(browser, { gem: () => gem('해결안'), cla: () => cla('판정: 반려\n## 결함 표') });
    await runJob(page);
    ok((await statusText(page)).includes('2회 반려'), '2회 반려 상태');
    await ctx.close();
  }
  console.log('D. 오류 처리: 400은 재시도 없음 / 503은 재시도 후 성공');
  {
    const { ctx, page, calls } = await newPage(browser, { gem: () => httpErr(400, 'bad model'), cla: () => cla('판정: 통과') });
    await runJob(page);
    const st = await statusText(page);
    ok(st.includes('오류') && st.includes('400'), '400 오류 표시');
    ok(calls.gem === 1, '400은 재시도하지 않음');
    await ctx.close();
  }
  {
    const { ctx, page, calls } = await newPage(browser, { gem: (n) => n === 1 ? httpErr(503, 'overloaded') : gem('해결안'), cla: () => cla('판정: 통과') });
    await runJob(page);
    ok((await statusText(page)).includes('최종 판정: 통과'), '503 후 재시도 성공');
    ok(calls.gem === 2, '503 1회 재시도');
    await ctx.close();
  }
  console.log('E. 역할 전환 (코드 유형 = Claude 해결)');
  {
    const order = [];
    const { ctx, page } = await newPage(browser, { gem: () => { order.push('gem'); return gem('판정: 통과\n## 결함 표'); }, cla: () => { order.push('cla'); return cla('코드 해결안'); } });
    await runJob(page, { type: 'code', problem: 'Firebase 규칙 작성' });
    ok(order[0] === 'cla' && order[1] === 'gem', 'Claude 해결 → Gemini 검증 순서');
    ok((await statusText(page)).includes('최종 판정: 통과'), '통과');
    await ctx.close();
  }
  console.log('F. 기록 · KPI · CSV · 삭제 · 백업');
  {
    const { ctx, page } = await newPage(browser, { gem: () => gem('해결안'), cla: () => cla('판정: 통과') });
    await runJob(page, { title: '기록 테스트' });
    await page.click('nav button[data-view=history]');
    ok(await page.locator('#hList .item').count() === 1, '기록 1건');
    ok((await page.locator('#kpis').innerText()).includes('완료 건수'), 'KPI 표시');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
    ok(/dual-llm-kpi-.*\.csv$/.test(dl.suggestedFilename()), 'CSV 다운로드');
    await page.reload();
    await page.click('nav button[data-view=history]');
    ok(await page.locator('#hList .item').count() === 1, '새로고침 후 기록 유지');
    await page.click('[data-del]');
    ok(await page.locator('#hList .item').count() === 0, '삭제 반영');
    await ctx.close();
  }
  console.log('G. 키 없음 → 설정 화면 이동');
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE);
    ok(await page.locator('#view-settings').evaluate(el => el.classList.contains('on')), '키가 없으면 설정 탭으로 이동');
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed ? 1 : 0);
