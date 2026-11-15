/** Consume a payment recovery link without ever sending its fragment to the API. */
export function consumeSubscriptionRecovery(href: string, replace: (path: string) => void) {
  const url = new URL(href);
  const id = url.searchParams.get('subscription_resume');
  if (!id) return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = fragment.get('token');
  const purpose = fragment.get('purpose') === 'renewal' ? 'renewal' : 'registration';
  url.searchParams.delete('subscription_resume');
  url.hash = '';
  replace(`${url.pathname}${url.search}`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return { id, token, purpose };
}
