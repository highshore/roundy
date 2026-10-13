import type { MetadataRoute } from 'next';
import { publicPages, siteUrl } from '@/lib/seo';
export default function sitemap(): MetadataRoute.Sitemap {
 return Object.keys(publicPages).map(path => ({ url: siteUrl + path }));
}
