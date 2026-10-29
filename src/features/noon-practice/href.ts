/** Internal tracked hand-off link (the route resolves and logs; pages never embed a raw Noon URL). */
export function practiceHref(src: string, p: { topicId?: string | null; subskillId?: string | null } = {}) {
  const qs = new URLSearchParams({ src });
  if (p.topicId) qs.set("topic", p.topicId);
  if (p.subskillId) qs.set("subskill", p.subskillId);
  return `/go/noon?${qs}`;
}
