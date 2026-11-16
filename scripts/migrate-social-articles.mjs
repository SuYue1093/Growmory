import { openStore } from '../server/store.mjs';
import { migrateSocialArticles } from '../server/social-import.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = process.argv[2] || fileURLToPath(new URL('../data/growmory.sqlite', import.meta.url));
if (!existsSync(path)) throw Error('工作区数据库不存在');
console.log(`迁移完成，新增 ${migrateSocialArticles(openStore(path, {}))} 篇营销内容。`);
