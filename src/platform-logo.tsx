import type { CSSProperties } from 'react';
import { findPlatform } from './platforms';
export function PlatformLogo({ platform, size = 24 }: { platform: string; size?: number }) {
  const value = findPlatform(platform);
  return <span className="platform-logo" aria-hidden="true" style={{ '--platform-color': value?.color || '#667085', width: size, height: size } as CSSProperties}>{value?.id === 'jike' ? <img src="/platforms/jike.png" alt=""/> : value ? <span style={{ maskImage: `url(/platforms/${value.icon}.svg)`, WebkitMaskImage: `url(/platforms/${value.icon}.svg)` }}/> : <span className="platform-logo-fallback">{platform.slice(0,1)}</span>}</span>;
}
