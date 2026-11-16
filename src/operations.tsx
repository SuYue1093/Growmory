import { platformCatalog, type PlatformId } from './platforms';
import { PlatformLogo } from './platform-logo';
import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SocialAnalytics } from './social-analytics';
import type { Product } from './types';
import { useI18n } from './i18n.ts';

export function Operations({ products, initialPlatform = 'xiaohongshu' }: { products: Product[]; initialPlatform?: PlatformId }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'accounts' | 'data'>('data');
  const platformRail = useRef<HTMLElement>(null);
  const [platform, setPlatform] = useState<PlatformId>(initialPlatform);

  return <div className="operations-workspace">
    <div className="operations-platform-shell">
      <nav ref={platformRail} className="operations-platforms" aria-label={t("运营平台", "Operations Platforms")}>
        {platformCatalog.map(p => (
          <button key={p.id} aria-pressed={platform === p.id} onClick={() => setPlatform(p.id)}>
            <PlatformLogo platform={p.id} size={28}/>
            <span>{p.name}</span>
          </button>
        ))}
      </nav>
      <div className="operations-platform-scroll">
        <button className="icon-button" aria-label={t("向左查看更多平台", "Scroll platforms left")} onClick={() => platformRail.current?.scrollBy({ left: -330, behavior: 'smooth' })}>
          <ChevronLeft size={16}/>
        </button>
        <button className="icon-button" aria-label={t("向右查看更多平台", "Scroll platforms right")} onClick={() => platformRail.current?.scrollBy({ left: 330, behavior: 'smooth' })}>
          <ChevronRight size={16}/>
        </button>
      </div>
    </div>

    <div className="tabs operations-tabs" role="tablist" aria-label={t("运营模块", "Operations Tabs")}>
      {([['data', t('数据总览', 'Data Overview')], ['accounts', t('自媒体账号', 'Social Accounts')]] as const).map(([id, label]) => (
        <button key={id} id={`operations-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`operations-panel-${id}`} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
          {label}
        </button>
      ))}
    </div>
    <div id={`operations-panel-${tab}`} role="tabpanel" aria-labelledby={`operations-tab-${tab}`}>
      <SocialAnalytics products={products} scope="all" activePlatform={platform} view={tab}/>
    </div>
  </div>;
}
