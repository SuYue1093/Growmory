const modelPack = [
  ["laptop-14-silver", "Open 14 inch laptop", "38821", "laptop-open-14-ad4c2b1d"],
  ["laptop-14-graphite", "Open 14 inch laptop in graphite", "38820", "laptop-open-14-graphite-d28918e7"],
  ["laptop-16", "Open 16 inch laptop", "38822", "laptop-open-16-683c7073"],
  ["laptop-13-closed", "Closed 13 inch laptop", "38823", "laptop-closed-13-ea6b62e9"],
  ["laptop-convertible", "Convertible flip laptop", "38825", "laptop-convertible-flip-068fe56f"],
  ["desktop-24", "24 inch all in one desktop", "38830", "all-in-one-24-7ccaaccd"],
  ["monitor-24", "24 inch flat monitor", "38831", "monitor-24-flat-7108a75c"],
  ["monitor-32", "32 inch 4K monitor", "38832", "monitor-32-4k-89c46f3a"],
  ["monitor-curved", "34 inch curved monitor", "38833", "monitor-34-curved-bc2883cf"],
  ["monitor-portrait", "24 inch portrait monitor", "38835", "monitor-24-portrait-76207c76"],
  ["tablet-11", "11 inch tablet", "38844", "tablet-11-1396cd43"],
  ["stylus", "Stylus pen", "38846", "stylus-pen-d91774af"],
  ["phone-61", "6.1 inch smartphone", "38847", "smartphone-61-9d832bea"],
  ["phone-67", "6.7 inch smartphone", "38848", "smartphone-67-a83244e4"],
  ["phone-fold", "Fold phone open", "38850", "phone-fold-open-3e789853"],
  ["ereader-7", "7 inch e-reader", "38849", "e-reader-7-5449c417"],
  ["mouse-wireless", "Wireless mouse", "38842", "mouse-wireless-de71674e"],
  ["headphones-over-ear", "Over-ear headphones", "38851", "headphones-over-ear-bc21b783"],
  ["earbuds-pair", "Wireless earbuds", "38853", "earbuds-pair-5824aaec"],
  ["microphone", "Condenser microphone", "38856", "microphone-condenser-762c7fa7"],
  ["webcam-4k", "4K webcam", "38857", "webcam-4k-f5934b1d"],
  ["desk-lamp", "Articulated desk lamp", "38866", "desk-lamp-articulated-1b79faf9"],
  ["usb-hub", "Seven port USB hub", "38874", "usb-hub-7port-28976e9d"],
].map(([slug, name, assetId, sourceSlug]) => ({
  id: `generic-${slug}`, name, kind: 'model', file: `generic-${slug}.glb`,
  device: 'generic', usage: 'render-to-png-first', license: 'CC0-1.0',
  source: `https://3dassets.dev/assets/computers-and-desk-gadgets-${sourceSlug}`,
  download: `https://cdn.3dassets.dev/assets/${assetId}/v1/model.glb`,
  previewFile: `generic-${slug}.webp`,
  previewDownload: `https://cdn.3dassets.dev/assets/${assetId}/v1/thumb.webp`,
  ...(['phone-61', 'phone-67', 'tablet-11', 'laptop-16', 'desktop-24'].includes(slug) && {
    usage: 'screen-texture',
    screenOrientation: slug.startsWith('phone-') || slug.startsWith('tablet-') ? 'flat-portrait' : 'upright-landscape',
  }),
}));

const bezelMirror = 'https://cdn.jsdelivr.net/gh/blaineam/Monkr@a70294570f5a92255506c315dd7782368dd07c45/static/devices';
const officialBezels = [
  ['ipad-pro-m5-13', 'iPad Pro M5 13-inch', 'Bezel-iPad-Pro-%28M5%29.dmg', [118, 124, 2064, 2752], 61, ['silver', 'space-black']],
  ['ipad-pro-m5-11', 'iPad Pro M5 11-inch', 'Bezel-iPad-Pro-%28M5%29.dmg', [106, 110, 1668, 2420], 61, ['silver', 'space-black']],
  ['imac-m4-24', 'iMac M4 24-inch', 'Bezel-iMac-M4.dmg', [140, 150, 4480, 2520], 0, ['silver', 'blue', 'pink']],
  ['macbook-neo', 'MacBook Neo', 'Bezel-MacBook-Neo.dmg', [406, 297, 2408, 1506], 0, ['silver', 'indigo', 'blush']],
].flatMap(([device, name, archive, screen, radius, colors]) => colors.map(color => {
  const id = `${device}-${color}`;
  return {
    id, name: `${name} · ${color.replaceAll('-', ' ')}`, kind: 'frame', file: `${id}.png`,
    usage: 'screen-overlay', screen, radius, license: 'Apple Design Resources',
    source: 'https://developer.apple.com/design/resources/#product-bezels',
    licensePage: 'https://developer.apple.com/app-store/marketing/guidelines/#images',
    original: `https://devimages-cdn.apple.com/design/resources/download/${archive}`,
    download: `${bezelMirror}/${device}/${color}.png`,
  };
}));

const macbookAir = {
  id: 'macbook-air-mobilefirst', name: 'MacBook Air 13-inch · Front', kind: 'frame',
  file: 'macbook-air-mobilefirst.png', usage: 'screen-overlay', screen: [89, 26, 621, 389], radius: 0,
  source: 'https://www.webmobilefirst.com/en/mockups/macbook-air/',
  license: 'Mobile FIRST · commercial design use; standalone redistribution prohibited',
  download: 'https://www.webmobilefirst.com/img/mockups/mockup-macbook-air-transparent.png',
};

const openPeeps = [
  ['standing', [1, 3, 5, 7, 9, 11, 14, 17, 20, 23, 26, 29]],
  ['sitting', [1, 3, 5, 7, 10, 13, 16, 18]],
  ['bust', [3, 12, 21, 33, 45, 59]],
].flatMap(([pose, ids]) => ids.map(index => {
  const slug = pose === 'bust' ? `peep-${index}` : `peep-${pose}-${index}`;
  const id = `open-peeps-${pose}-${index}`;
  const original = `https://cdn.jsdelivr.net/gh/Hantuhan/peepstudio@3bad422845c470ae11531b765fe88451cdb2b66f/public/peeps/templates/${pose}/${slug}.svg`;
  return {
    id, name: `Open Peeps · ${pose} ${index}`, kind: 'illustration', collection: 'Open Peeps', file: `${id}.png`,
    usage: 'image-layer', license: 'CC0-1.0', attribution: 'Open Peeps by Pablo Stanley',
    source: 'https://www.pablostanley.com/work/open-peeps', original, sourceFile: `${id}.svg`,
  };
}));

const patternFills = [
  ['1-circles', ['circles-2', 'circles-5', 'circles-8']],
  ['2-diagonal-stripe', ['diagonal-stripe-2', 'diagonal-stripe-4', 'diagonal-stripe-6']],
  ['3-dots', ['dots-2', 'dots-4', 'dots-7']],
  ['4-horizontal-stripe', ['horizontal-stripe-3', 'horizontal-stripe-7']],
  ['5-vertical-stripe', ['vertical-stripe-3', 'vertical-stripe-7']],
  ['6-other', ['crosshatch', 'houndstooth', 'subtle-patch', 'whitecarbon']],
].flatMap(([folder, slugs]) => slugs.map(slug => {
  const id = `patternfills-${slug}`;
  const original = `https://cdn.jsdelivr.net/gh/iros/patternfills@cfd578c3a967982eaf545d0293491ef6828ec2c8/src/patterns/${folder}/${slug}.svg`;
  return {
    id, name: slug.replaceAll('-', ' '), kind: 'pattern', collection: 'Pattern Fills', file: `${id}.png`,
    usage: 'image-layer', license: 'MIT', attribution: 'Pattern Fills by Irene Ros',
    source: 'https://github.com/iros/patternfills', original, sourceFile: `${id}.svg`,
  };
}));

export const sourcePackAssets = [...modelPack, ...officialBezels, macbookAir, ...openPeeps, ...patternFills];
