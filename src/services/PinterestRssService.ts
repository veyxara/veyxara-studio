// src/services/PinterestRssService.ts
import type { Wallpaper } from '../components/WallpaperCard.astro';

interface RawPinCandidate {
  title: string;
  image: string;
  pinterestUrl: string;
}

const MAX_WALLPAPERS = 40;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
};

export class PinterestRssService {
  constructor(
    private readonly feedUrls: readonly string[],
    private readonly fallbackWallpapers: readonly Wallpaper[] = []
  ) {}

  public async fetchWallpapers(): Promise<Wallpaper[]> {
    const candidates: RawPinCandidate[] = [];
    const seenImages = new Set<string>();

    for (const rssUrl of this.feedUrls) {
      if (candidates.length >= MAX_WALLPAPERS) break;

      try {
        const separator = rssUrl.includes('?') ? '&' : '?';
        const freshUrl = `${rssUrl}${separator}t=${Date.now()}`;
        const response = await fetch(freshUrl, {
          cache: 'no-store',
          headers: DEFAULT_HEADERS,
        });

        if (!response.ok) continue;

        const xmlText = await response.text();
        const blockRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
        const targetBoardUrl = rssUrl.replace(/\.rss(?:\?.*)?$/i, '');
        let match: RegExpExecArray | null;

        while ((match = blockRegex.exec(xmlText)) !== null) {
          if (candidates.length >= MAX_WALLPAPERS) break;

          const itemContent = match[1];
          const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const descMatch = itemContent.match(
            /<(?:description|content|summary)[^>]*>([\s\S]*?)<\/(?:description|content|summary)>/i
          );

          const rawTitle = titleMatch
            ? titleMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim()
            : '';

          const cleanTitle = this.sanitizePinTitle(rawTitle);
          if (!cleanTitle) continue;

          const descText = descMatch
            ? descMatch[1].replace('<![CDATA[', '').replace(']]>', '')
            : '';

          const imgMatch =
            descText.match(/src=["'](https:\/\/i\.pinimg\.com\/[^"']+)["']/i) ||
            itemContent.match(/(https:\/\/i\.pinimg\.com\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp))/i);

          const rawImageUrl = imgMatch?.[1]?.trim() ?? '';
          if (!rawImageUrl) continue;

          const preferredImageUrl = rawImageUrl.replace(/\/\d+x\//, '/736x/');
          if (seenImages.has(preferredImageUrl) || seenImages.has(rawImageUrl)) continue;

          const resolvedImageUrl = await this.resolveReachableImageUrl(
            preferredImageUrl,
            rawImageUrl
          );

          if (!resolvedImageUrl || seenImages.has(resolvedImageUrl)) continue;

          seenImages.add(resolvedImageUrl);
          candidates.push({
            title: cleanTitle,
            image: resolvedImageUrl,
            pinterestUrl: targetBoardUrl,
          });
        }
      } catch {
        // Si un feed externo falla, continuamos con los siguientes feeds o el respaldo
      }
    }

    const mappedFromFeed: Wallpaper[] = candidates
      .slice(0, MAX_WALLPAPERS)
      .map((candidate, index) => ({
        id: `pin-${index}`,
        title: candidate.title,
        category: 'Mobile',
        resolution: '1080x1920 (FHD+)',
        aspectRatio: '9:16',
        image: candidate.image,
        pinterestUrl: candidate.pinterestUrl,
      }));

    if (mappedFromFeed.length >= MAX_WALLPAPERS || this.fallbackWallpapers.length === 0) {
      return mappedFromFeed;
    }

    for (const fallback of this.fallbackWallpapers) {
      if (mappedFromFeed.length >= MAX_WALLPAPERS) break;
      if (seenImages.has(fallback.image)) continue;

      seenImages.add(fallback.image);
      mappedFromFeed.push({
        ...fallback,
        id: fallback.id || `pin-fallback-${mappedFromFeed.length}`,
      });
    }

    return mappedFromFeed.slice(0, MAX_WALLPAPERS);
  }

  private sanitizePinTitle(rawTitle: string): string {
    const withoutHtml = rawTitle.replace(/<[^>]*>/g, ' ');
    const beforeMarkers = withoutHtml.split('#')[0]?.split('|')[0] ?? '';
    const cleaned = beforeMarkers.replace(/\s+/g, ' ').trim();

    const alphanumericCount = (cleaned.match(/[\p{L}\p{N}]/gu) ?? []).length;
    if (alphanumericCount < 2) return '';

    return cleaned.length > 45 ? `${cleaned.substring(0, 42)}...` : cleaned;
  }

  private async resolveReachableImageUrl(
    preferredUrl: string,
    fallbackUrl: string
  ): Promise<string> {
    if (await this.isImageReachable(preferredUrl)) {
      return preferredUrl;
    }

    if (fallbackUrl !== preferredUrl && (await this.isImageReachable(fallbackUrl))) {
      return fallbackUrl;
    }

    return preferredUrl;
  }

  private async isImageReachable(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
        headers: {
          'User-Agent': DEFAULT_HEADERS['User-Agent'],
          Range: 'bytes=0-1024',
        },
      });

      if (!res.ok && res.status !== 206) {
        return false;
      }

      const contentType = res.headers.get('content-type') ?? '';
      return contentType.startsWith('image/') || contentType === '';
    } catch {
      return false;
    }
  }
}