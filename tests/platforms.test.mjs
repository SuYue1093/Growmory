import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { platformCatalog, findPlatform, channelOptions } from '../src/platforms.ts';
import { openStore } from '../server/store.mjs';
import { saveSocial, socialContext } from '../server/social-analytics.mjs';
import { runTool } from '../server/mcp-tools.mjs';
test('全站平台别名去重且每个平台均有本地品牌Logo',()=>{
 assert.equal(findPlatform('Twitter').name,'X');assert.equal(findPlatform('掘金').name,'稀土掘金');assert.equal(findPlatform('producthunt').name,'Product Hunt');
 const options=channelOptions(['Twitter','掘金','producthunt']);assert.equal(options.length,platformCatalog.length);
 for(const p of platformCatalog)assert.ok(existsSync(new URL(`../public/platforms/${p.icon}.${p.id==='jike'?'png':'svg'}`,import.meta.url)),p.name);
});
test('全部常用平台可创建账号并由MCP按平台筛选，域名混用拒绝',()=>{
 const store=openStore(':memory:',{products:[],docs:[],contents:[],releases:[],tasks:[]});
 try{
  let revision=0;
  for(const p of platformCatalog){
   const result=saveSocial(store,{expectedRevision:revision,accounts:[{platform:p.id,name:p.name,url:`https://${p.domains[0]}/account/test`}]});revision=result.revision;
   assert.equal(socialContext(store,{platform:p.id}).accounts.length,1);
   assert.equal(runTool(store,'get_social_analytics_context',{platform:p.id},{enabled:true}).accounts.length,1);
   assert.throws(()=>saveSocial(store,{expectedRevision:revision,accounts:[{platform:p.id,name:'错误域名',url:'https://example.com/user'}]}),/不匹配/);
  }
  assert.equal(socialContext(store).accounts.length,platformCatalog.length);
 }finally{store.close();}
});
