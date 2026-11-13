import { MetadataRoute } from 'next';
import { CANONICAL_PUBLIC_ORIGIN } from '@/lib/origin';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: CANONICAL_PUBLIC_ORIGIN,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/auth`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
