import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {saveSocial,socialContext} from '../server/social-analytics.mjs';
for (const platform of ['xiaohongshu','reddit']) test(`${platform}：指标独立保存，缺正文补采后可续采，正文跨快照复用且时间不伪更新`,()=>{
 const store=openStore(':memory:',{products:[],docs:[],contents:[],tasks:[],releases:[]});
 try {
  const url=platform==='reddit'?'https://reddit.com/r/test/comments/abc':'https://www.xiaohongshu.com/explore/abc';
  const home=platform==='reddit'?'https://reddit.com/user/self':'https://www.xiaohongshu.com/user/profile/self';
  const accountId=saveSocial(store,{expectedRevision:0,accounts:[{name:'自己',platform,url:home}]}).accounts[0].id;
  const row={accountId,kind:'content',title:'原始标题',url,source:'api',sourceNote:'列表实际指标',observedAt:'2026-11-06T08:00:00Z',period:'lifetime',periodEnd:'2026-11-06',metrics:{likes:2}};
  saveSocial(store,{expectedRevision:1,snapshots:[row]});
  assert.equal(socialContext(store).collectionIndex[0].bodyStatus,'missing');
  assert.throws(()=>saveSocial(store,{expectedRevision:2,snapshots:[{...row,articleDetails:{bodyStatus:'complete'}}]}),/省略/);
  saveSocial(store,{expectedRevision:2,snapshots:[{...row,body:'完整原文',articleDetails:{bodyStatus:'complete'},observedAt:'2026-11-06T09:00:00Z'}]});
  let c=socialContext(store);assert.equal(c.collectionIndex[0].bodyStatus,'complete');
  saveSocial(store,{expectedRevision:3,snapshots:[{...row,title:'新标题',observedAt:'2026-11-07T08:00:00Z',periodEnd:'2026-11-07',metrics:{likes:5}}]});
  c=socialContext(store);assert.equal(c.snapshots.length,3);assert.equal(c.snapshots[2].body,undefined);
  assert.equal(c.summaries[0].body,'完整原文');assert.equal(c.summaries[0].metrics.likes,5);
  assert.equal(c.summaries[0].bodyObservedAt,'2026-11-06T09:00:00Z');
  assert.equal(c.collectionIndex[0].bodyTitle,'原始标题');assert.equal(c.collectionIndex[0].title,'新标题');
  saveSocial(store,{expectedRevision:4,snapshots:[{...row,url:url+'other'}]});
  assert.equal(socialContext(store).collectionIndex.find(s=>s.url===url+'other').bodyStatus,'missing');
  saveSocial(store,{expectedRevision:5,snapshots:[{...row,url:url+'empty',body:'',articleDetails:{bodyStatus:'empty'}}]});
  c=socialContext(store);assert.equal(c.collectionIndex.find(s=>s.url===url+'empty').bodyStatus,'empty');
  const restored=openStore(':memory:',store.read().data);try{assert.equal(socialContext(restored).collectionIndex.find(s=>s.url===url).bodyStatus,'complete');}finally{restored.close();}
 }finally{store.close();}
});
