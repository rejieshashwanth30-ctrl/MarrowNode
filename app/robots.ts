import { MetadataRoute } from 'next';
import { CANONICAL_PUBLIC_ORIGIN } from '@/lib/origin';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/project/'],
    },
    sitemap: `${CANONICAL_PUBLIC_ORIGIN}/sitemap.xml`,
  };
}
