// src/services/PinterestRssService.ts
import type { Wallpaper } from '../components/WallpaperCard.astro';

interface RawPinCandidate {
  title: string;
  image: string;
  pinterestUrl: string;
}

export class PinterestRssService {
  constructor(private readonly feedUrls: readonly string[]) {}

  public async fetchWallpapers(): Promise<Wallpaper[]> {
    const candidates: RawPinCandidate[] = [];
    const seenImages = new Set<string>();

    for (const rssUrl of this.feedUrls) {
      try {
        const freshUrl = `${rssUrl}?t=${Date.now()}`;
        const response = await fetch(freshUrl, {
          cache: 'no-store',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });

        if (!response.ok) continue;

        const xmlText = await response.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const targetBoardUrl = rssUrl.replace('.rss', '');
        let match: RegExpExecArray | null;

        while ((match = itemRegex.exec(xmlText)) !== null) {
          const itemContent = match[1];
          const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
          const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);

          const rawTitle = titleMatch
            ? titleMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim()
            : '';

          const cleanTitle = this.sanitizePinTitle(rawTitle);
          if (!cleanTitle) continue;

          const descText = descMatch ? descMatch[1] : '';
          const imgMatch =
            descText.match(/src="(https:\/\/i\.pinimg\.com\/[^"]+)"/) ||
            itemContent.match(/(https:\/\/i\.pinimg\.com\/[^"'\s]+?\.(?:jpg|png|webp))/i);

          const imageUrl = imgMatch?.[1] ? imgMatch[1].replace(/\/\d+x\//, '/736x/') : '';
          if (!imageUrl || seenImages.has(imageUrl)) continue;

          seenImages.add(imageUrl);
          candidates.push({
            title: cleanTitle,
            image: imageUrl,
            pinterestUrl: targetBoardUrl,
          });
        }
      } catch {
        // Si un feed externo falla, el catálogo local sigue funcionando sin interrupciones
      }
    }

    const reachability = await Promise.all(
      candidates.map((candidate) => this.isImageReachable(candidate.image))
    );

    return candidates
      .filter((_, index) => reachability[index])
      .map((candidate, index) => ({
        id: `pin-${index}`,
        title: candidate.title,
        category: 'Mobile',
        resolution: '1080x1920 (FHD+)',
        aspectRatio: '9:16',
        image: candidate.image,
        pinterestUrl: candidate.pinterestUrl,
      }));
  }

  private sanitizePinTitle(rawTitle: string): string {
    const withoutHtml = rawTitle.replace(/<[^>]*>/g, ' ');
    const beforeMarkers = withoutHtml.split('#')[0]?.split('|')[0] ?? '';
    const cleaned = beforeMarkers.replace(/\s+/g, ' ').trim();

    const alphanumericCount = (cleaned.match(/[\p{L}\p{N}]/gu) ?? []).length;
    if (alphanumericCount < 4) return '';

    return cleaned.length > 45 ? `${cleaned.substring(0, 42)}...` : cleaned;
  }

  private async isImageReachable(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(2500),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const contentType = res.headers.get('content-type') ?? '';
      return res.ok && contentType.startsWith('image/');
    } catch {
      return false;
    }
  }
}