import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { operationsContext, saveOperationPost, deleteOperationPosts } from '../server/operations.mjs';
import { saveSocial, socialContext } from '../server/social-analytics.mjs';
import { runTool, toolDefinitions } from '../server/mcp-tools.mjs';
const initial = () => ({ products:[{id:'p',name:'产品',summary:'介绍',appId:'',price:'',platform:'iOS',website:'',color:'blue'}], docs:[],contents:[],tasks:[],releases:[] });
test('历史运营帖子，按链接更新且保留状态，冲突与错误批次不写库',()=>{
 const store=openStore(':memory:',initial());
 try {
   assert.ok(!toolDefinitions.some(t=>['get_promotion_context','save_promotions','get_operations_context','save_operation_posts','delete_operation_posts'].includes(t.name)));
  const fields={productId:'p',title:'寻找工具',sourceTitle:'寻找工具',body:'原帖正文和参与建议',reason:'需求匹配',channel:'Reddit',url:'https://www.reddit.com/r/test/comments/abc?utm_source=test',checkedAt:'2026-11-06'};
  const saved=saveOperationPost(store,{expectedRevision:0,fields});
  saveOperationPost(store,{expectedRevision:1,id:saved.record.id,fields:{status:'dismissed'}});
  const updated=saveOperationPost(store,{expectedRevision:2,fields:{...fields,url:'https://reddit.com/r/test/comments/abc/',body:'更新正文'}});
  assert.equal(updated.record.status,'dismissed');assert.equal(updated.record.id,saved.record.id);
  assert.equal(operationsContext(store).posts.length,1);
  assert.throws(()=>saveOperationPost(store,{expectedRevision:2,fields}),/已更新/);
  for(const patch of [{channel:'小红书'}, {checkedAt:'2026-02-30'}, {channel:'X'}, {kind:'action'}])assert.throws(()=>saveOperationPost(store,{expectedRevision:3,fields:{...fields,...patch}}));
  assert.equal(store.read().revision,3);
  assert.equal(operationsContext(store,{productId:'p'}).posts[0].body,'更新正文');
 }finally{store.close();}
});
test('批量删除帖子与指标校验revision、ID和权限，不影响账号与旧行动',()=>{
 const store=openStore(':memory:',initial());
 try {
  const {accounts}=saveSocial(store,{expectedRevision:0,accounts:[{platform:'reddit',name:'自己',url:'https://reddit.com/user/self'}]});
  const snapshot={accountId:accounts[0].id,kind:'content',title:'内容',body:'自己帖子的完整正文',url:'https://reddit.com/r/test/comments/own',observedAt:'2026-11-06T08:00:00Z',period:'lifetime',periodEnd:'2026-11-06',source:'api',sourceNote:'真实字段',metrics:{score:2}};
  saveSocial(store,{expectedRevision:1,snapshots:[snapshot,{...snapshot,observedAt:'2026-11-05T08:00:00Z',periodEnd:'2026-11-05'}]});
  const rows=socialContext(store).snapshots;
  assert.throws(()=>saveSocial(store,{expectedRevision:1,deleteSnapshotIds:[rows[0].id]}),/已更新/);
  assert.throws(()=>saveSocial(store,{expectedRevision:2,deleteSnapshotIds:[rows[0].id,'missing']}),/不存在/);
  assert.equal(socialContext(store).snapshots.length,2);
  assert.equal(saveSocial(store,{expectedRevision:2,deleteSnapshotIds:[rows[0].id]}).deleted,1);
  assert.equal(socialContext(store).snapshots.length,1);assert.equal(socialContext(store).accounts.length,1);
  const saved=saveOperationPost(store,{expectedRevision:3,fields:{productId:'p',title:'讨论',body:'原帖正文',reason:'匹配',channel:'Reddit',url:'https://reddit.com/r/test/comments/other',sourceTitle:'讨论',checkedAt:'2026-11-06'}});
  assert.throws(()=>deleteOperationPosts(store,{expectedRevision:4,deleteIds:[saved.record.id,'missing']}),/不存在/);
  assert.equal(deleteOperationPosts(store,{expectedRevision:4,deleteIds:[saved.record.id]}).deleted,1);
  assert.equal(operationsContext(store).posts.length,0);assert.equal(socialContext(store).snapshots.length,1);
 }finally{store.close();}
});

test('历史 Reddit 数据区分正文状态，详情可持久恢复，明确区分无文字和未采集',()=>{
 const store=openStore(':memory:',initial());
 try {
  const {accounts}=saveSocial(store,{expectedRevision:0,accounts:[{platform:'reddit',name:'自己',url:'https://reddit.com/user/self'}]});
  const row={accountId:accounts[0].id,kind:'content',title:'完整文章',url:'https://reddit.com/r/test/comments/full',observedAt:'2026-11-06T08:00:00Z',period:'lifetime',periodEnd:'2026-11-06',source:'api',sourceNote:'reddit_post_details完整返回',metrics:{score:3}};
  assert.throws(()=>saveSocial(store,{expectedRevision:1,snapshots:[{...row,body:''}]}),/完整正文/);
  const body='完整正文段落。'.repeat(150);
  const articleDetails={author:'self',community:'test',tags:['生产力'],mediaUrls:['https://i.redd.it/test.png'],linkUrl:'https://example.com',bodyStatus:'complete'};
  saveSocial(store,{expectedRevision:1,snapshots:[{...row,body,articleDetails,publishedTime:'2026-11-05T09:00:00Z',contentType:'text'}]});
  const restored=openStore(':memory:',store.read().data);
  try{assert.equal(socialContext(restored).snapshots[0].body,body);assert.deepEqual(socialContext(restored).snapshots[0].articleDetails,{author:'self',community:'test',tags:['生产力'],bodyStatus:'complete'});}finally{restored.close();}
  assert.throws(()=>saveSocial(store,{expectedRevision:2,snapshots:[{...row,body:'',url:'https://reddit.com/r/test/comments/empty'}]}),/完整正文/);
  saveSocial(store,{expectedRevision:2,snapshots:[{...row,body:'',url:'https://reddit.com/r/test/comments/empty',contentType:'link',articleDetails:{bodyStatus:'empty',linkUrl:'https://example.com'}}]});
  assert.equal(socialContext(store).snapshots.length,2);
 }finally{store.close();}
});

test('潜在帖子允许只保存正文，参与建议独立且可选',()=>{
 const store=openStore(':memory:',initial());
 try {
  const fields={productId:'p',title:'寻找日历',body:'原帖完整正文',channel:'Reddit',url:'https://reddit.com/r/test/comments/simple',sourceTitle:'寻找日历',checkedAt:'2026-11-06'};
  const saved=saveOperationPost(store,{expectedRevision:0,fields});
  assert.equal(saved.record.body,fields.body);assert.equal(saved.record.reason,'');
  const updated=saveOperationPost(store,{expectedRevision:1,id:saved.record.id,fields:{participationAdvice:'分享日历安排经验'}});
  assert.equal(updated.record.participationAdvice,'分享日历安排经验');assert.equal(updated.record.body,fields.body);
  assert.equal(operationsContext(store).posts[0].participationAdvice,'分享日历安排经验');
 }finally{store.close();}
});

test('X 会员状态保存后进入营销上下文，旧账号按非会员处理', () => {
  const store = openStore(':memory:', initial());
  const access = { enabled: true, allowWrites: false };
  try {
    const { accounts } = saveSocial(store, { expectedRevision: 0, accounts: [
      { platform: 'x', name: '产品账号', url: 'https://x.com/product', productId: 'p', isPremium: true },
      { platform: 'x', name: '旧通用账号', url: 'https://x.com/shared' },
    ] });
    const read = () => runTool(store, 'get_marketing_context', { productId: 'p', channel: 'Twitter' }, access).xAccounts;
    assert.deepEqual(read().map(account => account.isPremium), [true, false]);

    saveSocial(store, { expectedRevision: 1, accounts: [{ ...accounts[0], isPremium: false }] });
    assert.equal(read()[0].isPremium, false);
    assert.equal(runTool(store, 'get_marketing_context', { productId: 'p', channel: 'Reddit' }, access).xAccounts, undefined);
    assert.throws(() => saveSocial(store, { expectedRevision: 2, accounts: [
      { platform: 'reddit', name: 'Reddit', url: 'https://reddit.com/user/self', isPremium: true },
    ] }), /只有 X 账号/);
  } finally { store.close(); }
});
