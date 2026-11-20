import { router, type Href } from 'expo-router';

/** Go back if there is somewhere to go (not true after a page reload or a deep link); otherwise replace with `fallback`. */
export function goBackOr(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
