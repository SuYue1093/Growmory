import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { saveSocial, socialContext } from '../server/social-analytics.mjs';
const initial = {products:[],docs:[],contents:[],tasks:[],releases:[]};
test('同标题不同ID分别保存，改标题不改身份；重名报表须确认，各来源时间不互相覆盖', () => {
 const store = openStore(':memory:',initial);
 try {
  const accountId = saveSocial(store,{expectedRevision:0,accounts:[{platform:'xiaohongshu',name:'自己',url:'https://www.xiaohongshu.com/user/profile/self'}]}).accounts[0].id;
  const base = {accountId,kind:'content',title:'同名',period:'lifetime',periodEnd:'2026-11-06',observedAt:'2026-11-06T08:00:00Z',sourceNote:'实际来源',metrics:{likes:2}};
  const report = {...base,source:'report',externalId:'xhs-report:abc',publishedTime:'2026-11-05T10:00:00+08:00',metrics:{views:100,impressions:300,likes:2}};
  const note = {...base,source:'api',url:'https://www.xiaohongshu.com/explore/abc',body:'完整正文',observedAt:'2026-11-06T09:00:00Z',metrics:{likes:3}};
  saveSocial(store,{expectedRevision:1,snapshots:[report,note,{...note,url:'https://www.xiaohongshu.com/explore/other'}]});
  assert.equal(socialContext(store).summaries.length,3);
  saveSocial(store,{expectedRevision:2,reportLinks:[{accountId,externalId:report.externalId,url:note.url}]});
  let c = socialContext(store); assert.equal(c.snapshots.length,3);assert.equal(c.summaries.length,2);
  let merged=c.summaries.find(s=>s.url===note.url);
  assert.deepEqual(merged.metrics,{likes:3,views:100,impressions:300});
  assert.equal(merged.metricOrigins.views.source,'report');assert.equal(merged.metricOrigins.likes.observedAt,note.observedAt);
  assert.equal(c.snapshots[0].url,undefined);assert.equal(c.snapshots[0].metrics.likes,2);
  saveSocial(store,{expectedRevision:3,snapshots:[{...note,url:'https://www.xiaohongshu.com/discovery/item/abc?xsec_token=test',title:'修改标题',observedAt:'2026-11-07T08:00:00Z',periodEnd:'2026-11-07',metrics:{likes:0,saves:null}}]});
  c=socialContext(store);assert.equal(c.summaries.length,2);merged=c.summaries.find(s=>s.title==='修改标题');
  assert.equal(merged.metrics.likes,0);assert.equal(merged.metrics.views,100);assert.equal(merged.metricOrigins.views.periodEnd,'2026-11-06');assert.equal(merged.metrics.saves,undefined);
  assert.equal(c.snapshots.length,4);
  assert.throws(()=>saveSocial(store,{expectedRevision:4,reportLinks:[{accountId:'wrong',externalId:report.externalId,url:note.url}]}));
  const restored=openStore(':memory:',store.read().data);try{assert.equal(socialContext(restored).summaries.length,2);}finally{restored.close();}
 }finally{store.close();}
});
test('不同来源、同日不同观察保留原始记录，重复采集幂等，区间不跨周期拼接',()=>{
 const store=openStore(':memory:',initial);
 try {
  const accountId=saveSocial(store,{expectedRevision:0,accounts:[{platform:'xiaohongshu',name:'自己',url:'https://www.xiaohongshu.com/user/profile/self'}]}).accounts[0].id;
  const row={accountId,kind:'content',title:'标题',url:'https://www.xiaohongshu.com/explore/a',source:'manual',sourceNote:'实际来源',period:'range',periodStart:'2026-11-01',periodEnd:'2026-11-06',observedAt:'2026-11-06T08:00:00Z',metrics:{views:20}};
  saveSocial(store,{expectedRevision:1,snapshots:[row]});saveSocial(store,{expectedRevision:2,snapshots:[{...row,metrics:{views:21}}]});
  assert.equal(socialContext(store).snapshots.length,1);
  saveSocial(store,{expectedRevision:3,snapshots:[{...row,source:'browser'}, {...row,observedAt:'2026-11-06T09:00:00Z'}, {...row,periodStart:'2026-11-02'}]});
  assert.equal(socialContext(store).snapshots.length,4);assert.equal(socialContext(store).summaries.length,2);
 }finally{store.close();}
});

test('小红书唯一同标题自动归集，多个候选保留原始记录并等待确认', () => {
 const store = openStore(':memory:', initial);
 try {
  const accountId = saveSocial(store,{expectedRevision:0,accounts:[{platform:'xiaohongshu',name:'自己',url:'https://www.xiaohongshu.com/user/profile/self'}]}).accounts[0].id;
  const common = {accountId,kind:'content',title:'测试标题',period:'lifetime',periodEnd:'2026-11-06',observedAt:'2026-11-06T08:00:00Z',sourceNote:'测试'};
  const report = {...common,source:'report',externalId:'xhs-report:abc',publishedTime:'2026-11-05T10:00:00+08:00',metrics:{views:100}};
  const note = {...common,title:' 测试标题 ',source:'api',url:'https://www.xiaohongshu.com/explore/abc',metrics:{likes:3}};
  saveSocial(store,{expectedRevision:1,snapshots:[report,note]});
  let c = socialContext(store);
  assert.equal(c.summaries.length,1);
  assert.deepEqual(c.summaries[0].metrics,{views:100,likes:3});
  assert.equal(c.snapshots[0].url,undefined);
  saveSocial(store,{expectedRevision:2,snapshots:[{...note,url:'https://www.xiaohongshu.com/explore/other',publishedTime:report.publishedTime}]});
  c = socialContext(store);
  assert.equal(c.summaries.length,3);
  assert.equal(Object.values(c.reportOptions)[0].length,2);
  saveSocial(store,{expectedRevision:3,reportLinks:[{accountId,externalId:report.externalId,url:note.url}]});
  c = socialContext(store);
  assert.equal(c.summaries.length,2);
  assert.deepEqual(c.reportOptions,{});
 }finally{store.close();}
});
