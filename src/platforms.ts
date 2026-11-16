export const platformCatalog = [
  { id: 'xiaohongshu', name: '小红书', icon: 'xiaohongshu', color: '#ff2442', domestic: true, inlineImages: false, domains: ['xiaohongshu.com', 'xhslink.com', 'xhslink.cn'], aliases: ['小红书', 'xiaohongshu', 'rednote'] },
  { id: 'reddit', name: 'Reddit', icon: 'reddit', color: '#ff4500', domestic: false, inlineImages: false, domains: ['reddit.com', 'redd.it'], aliases: ['reddit'] },
  { id: 'x', name: 'X', icon: 'x', color: '#171717', domestic: false, inlineImages: false, domains: ['x.com', 'twitter.com', 't.co'], aliases: ['x', 'twitter'] },
  { id: 'wechat', name: '微信公众号', icon: 'wechat', color: '#07c160', domestic: true, inlineImages: true, domains: ['mp.weixin.qq.com', 'weixin.qq.com'], aliases: ['微信公众号', '公众号', 'wechat'] },
  { id: 'juejin', name: '稀土掘金', icon: 'juejin', color: '#1e80ff', domestic: true, inlineImages: true, domains: ['juejin.cn', 'juejin.im'], aliases: ['稀土掘金', '掘金', 'juejin'] },
  { id: 'producthunt', name: 'Product Hunt', icon: 'producthunt', color: '#da552f', domestic: false, inlineImages: false, domains: ['producthunt.com'], aliases: ['producthunt', 'product hunt'] },
  { id: 'bilibili', name: 'B站', icon: 'bilibili', color: '#00a1d6', domestic: true, inlineImages: true, domains: ['bilibili.com', 'b23.tv'], aliases: ['b站', 'bilibili', '哔哩哔哩'] },
  { id: 'zhihu', name: '知乎', icon: 'zhihu', color: '#0084ff', domestic: true, inlineImages: true, domains: ['zhihu.com'], aliases: ['知乎', 'zhihu'] },
  { id: 'weibo', name: '微博', icon: 'sinaweibo', color: '#e6162d', domestic: true, inlineImages: false, domains: ['weibo.com', 'weibo.cn'], aliases: ['微博', 'weibo'] },
  { id: 'jike', name: '即刻', icon: 'jike', color: '#ffe411', domestic: true, inlineImages: false, domains: ['okjike.com'], aliases: ['即刻', 'jike'] },
  { id: 'discord', name: 'Discord', icon: 'discord', color: '#5865f2', domestic: false, inlineImages: false, domains: ['discord.com', 'discord.gg'], aliases: ['discord'] },
  { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin', color: '#0a66c2', domestic: false, inlineImages: false, domains: ['linkedin.com'], aliases: ['linkedin'] },
  { id: 'medium', name: 'Medium', icon: 'medium', color: '#242424', domestic: false, inlineImages: true, domains: ['medium.com'], aliases: ['medium'] },
] as const;
export type PlatformId = typeof platformCatalog[number]['id'];
export const platformIds = platformCatalog.map(p => p.id) as [PlatformId, ...PlatformId[]];
export const platformNames = platformCatalog.map(p => p.name) as [string, ...string[]];
export const platformLabels = Object.fromEntries(platformCatalog.map(p => [p.id,p.name])) as Record<PlatformId,string>;
export const inlineImagePlatforms = platformCatalog.filter(p => p.inlineImages).map(p => p.name);
export function findPlatform(value: string) {
  const key = value.trim().toLowerCase();
  return platformCatalog.find(p => p.id === key || p.aliases.some(a => a === key));
}
export function supportsInlineImages(value?: string): boolean {
  if (!value) return false;
  const platform = findPlatform(value);
  if (platform) return platform.inlineImages;
  return /公众号|微信|掘金|juejin|知乎|zhihu|medium|csdn|segmentfault|思否|简书|博客|blog|substack|专栏|infoq|notion|feishu|飞书|语雀|yuque/i.test(value);
}
export const platformName = (value: string) => findPlatform(value)?.name || value;
// 个人主页已从开源版本移除
export const isPersonalSiteChannel = (_value?: string) => false;
export function channelOptions(values: string[] = []) {
  return [...new Set([...platformNames, ...values.map(platformName).filter(Boolean)])];
}
