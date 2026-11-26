const githubAsset = (repo, revision, folder) =>
  file => `https://cdn.jsdelivr.net/gh/${repo}@${revision}/${folder}/${encodeURIComponent(file)}`;

const flowbite = githubAsset('themesberg/flowbite-illustrations', '8e5c17ff01b9f1a31bc3ad1c18d0d8a439eb4b81', 'src/3d/light');
const publicCode = githubAsset('publiccodenet/illustrations', '4bb128295047af6d1a5027f26e729efc088a1141', 'illustrations');
const heroPatterns = githubAsset('sschoger/hero-patterns', '6a2ed74a6910a8b1095d15dd31f7f3f0188517ad', 'svg');

const publicCodeFilenames = {
  'codebase-member': 'Codebase member', 'in-the-media': 'In the media', members: 'Members',
  'membership-evolution': 'Membership evolution', 'membership-gift': 'Membership gift', membership: 'Membership',
};

const collections = [
  {
    prefix: 'flowbite', collection: 'Flowbite Illustrations', kind: 'illustration',
    source: 'https://flowbite.com/illustrations/', license: 'MIT', attribution: 'Flowbite Illustrations by Berin Holy and Robert Tanislav',
    licensePage: 'https://github.com/themesberg/flowbite-illustrations/blob/8e5c17ff01b9f1a31bc3ad1c18d0d8a439eb4b81/LICENSE',
    original: slug => flowbite(`${slug}.svg`),
    slugs: `
      404-not-found-shopping 404-not-found-smiley authentication-form-fields balloon-package-flying couple-dancing-music
      credit-card-payment-receipt document-folders employees-working-charts employees-working-office gaming-controller-ghosts
      group-brainstorming laptop-404-not-found-error laptop-server-error man-adjusting-settings man-car-service-repairing
      man-clock-shopping-charts man-credit-card man-drawing man-pointing-smartphone man-question-marks man-repairing
      man-review-stars man-vr-headset man-working-programs man-working-question-mark password-lock-key people-connecting
      smartphone-application-features smartphone-charts smartphone-crypto-charts store-discount-open wallet-money
      woman-cooking-kitchen woman-cyber-security woman-earth-hugging woman-exchanging-money woman-fitness-gym woman-laptop-chart
      woman-laptop-chatting woman-laptop-sitting woman-laptop-standing woman-map woman-mindfulness-yoga woman-reading-paper-receipt
      woman-real-estate-selling woman-rocket-flying woman-scooter-transporting woman-shopping-cart woman-shopping-discount
      woman-shopping-online woman-shopping-window woman-tutoring-classroom woman-vr-headset woman-working-servers`,
  },
  {
    prefix: 'gravity', collection: 'Gravity UI', kind: 'illustration',
    source: 'https://gravity-ui.com/libraries/illustrations', license: 'MIT', attribution: 'Gravity UI Illustrations',
    licensePage: 'https://cdn.jsdelivr.net/npm/@gravity-ui/illustrations@2.1.1/LICENSE',
    original: slug => `https://cdn.jsdelivr.net/npm/@gravity-ui/illustrations@2.1.1/svgs/${slug}-light.svg`,
    slugs: `
      access-denied bucket chart database detail disk feature folder history identity internal-error network
      no-search-results not-found project queue snapshot success-operation template unable-to-display virtual-machine`,
  },
  {
    prefix: 'public-code', collection: 'Illustrations for Public Code', kind: 'illustration',
    source: 'https://illustrations.publiccode.net/', license: 'CC0-1.0', attribution: 'Foundation for Public Code',
    licensePage: 'https://creativecommons.org/publicdomain/zero/1.0/',
    original: slug => publicCode(`${publicCodeFilenames[slug] ?? slug}.svg`),
    slugs: `
      codebase-member in-the-media members membership-evolution membership-gift membership audit codebase-2 codebase-3
      codebase collaborative-dev-1 collaborative-dev-2 collaborative-dev community-2 community eco-system forward-thinking
      hands interconnecting-componements reuse service-1 service-2 service-3 social-software stewardship`,
  },
  {
    prefix: 'hero-patterns', collection: 'Hero Patterns', kind: 'pattern',
    source: 'https://heropatterns.com/', license: 'CC BY 4.0', attribution: 'Hero Patterns by Steve Schoger',
    licensePage: 'https://creativecommons.org/licenses/by/4.0/',
    original: slug => heroPatterns(`${slug}.svg`),
    slugs: 'anchors-away circuit-board cutout endless-clouds floating-cogs formal-invitation jigsaw jupiter leaf overcast texture topography',
  },
];

export const svgCollectionAssets = collections.flatMap(({ prefix, slugs, original, ...collection }) =>
  slugs.trim().split(/\s+/).map(slug => {
    const id = `${prefix}-${slug}`;
    const name = slug.replaceAll('-', ' ').replace(/^[a-z]/, char => char.toUpperCase());
    return {
      ...collection, id, name, usage: 'image-layer', file: `${id}.png`, sourceFile: `${id}.svg`, original: original(slug),
    };
  }));
