// Run against a server using the same temporary DB_PATH, never the user's workspace.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5199';
assert.match(process.env.DB_PATH || '', /^\/(?:private\/)?tmp\//, 'Use an isolated temporary DB_PATH');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function save(input){const c=await page.request.get(base+'/api/social-analytics').then(r=>r.json());const r=await page.request.post(base+'/api/social-analytics',{data:{...input,expectedRevision:c.revision}});assert.ok(r.ok(),await r.text());return r.json();}
 const saved=await save({accounts:[{platform:'xiaohongshu',name:'关联测试',url:'https://www.xiaohongshu.com/user/profile/identity-qa'}]});const accountId=saved.accounts.find(a=>a.name==='关联测试').id;
 const row={accountId,kind:'content',title:'同名',period:'lifetime',periodEnd:'2026-11-06',observedAt:'2026-11-06T08:00:00Z',sourceNote:'测试真实口径',source:'manual',url:'https://www.xiaohongshu.com/explore/identity-a',metrics:{likes:3}};
 const store = openStore(process.env.DB_PATH,{});
 try {
  const { saveSocial } = await import('../server/social-analytics.mjs');
  saveSocial(store,{expectedRevision:store.read().revision,snapshots:[row,{...row,url:'https://www.xiaohongshu.com/explore/identity-b',metrics:{likes:4}},{...row,url:undefined,source:'report',externalId:'xhs-report:identity',publishedTime:'2026-11-05T10:00:00+08:00',metrics:{impressions:100,likes:2}}]});
 } finally {store.close();}
 await page.goto(base+'/#page=operations&scope=all');
 const choice = page.getByRole('combobox',{name:'确认同标题笔记'});
 await choice.waitFor();
 assert.equal(await page.getByText(/报表关联（/).count(),0);
 assert.equal(await page.locator('.social-content-table tbody tr').count(),3);
 const pending = page.getByRole('button',{name:'筛选待确认（1 条）'});
 await pending.click();
 assert.equal(await page.locator('.social-content-table tbody tr').count(),1);
 await choice.selectOption(row.url);
 await page.getByText('当前没有待确认记录。').waitFor();
 await page.getByRole('button',{name:'筛选待确认（0 条）'}).click();
 await choice.waitFor({state:'hidden'});
 assert.equal(await page.locator('.social-content-table tbody tr').count(),2);
 assert.deepEqual((await page.locator('.social-content-table th').allTextContents()).slice(2), ['曝光','浏览','点赞','评论','收藏','分享','数据更新时间']);
 assert.equal(await page.locator('.social-content-table time').count(),2);
 assert.equal(await page.getByRole('checkbox',{name:'显示全部历史'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'刷新',exact:true}).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: 同名独立、行内确认关联、指标列排序、更新时间和手机布局');
}finally{await browser.close();}
